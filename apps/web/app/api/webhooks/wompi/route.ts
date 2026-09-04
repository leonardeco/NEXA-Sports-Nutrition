import { PaymentError } from "@nexa/core"
import { OrderNotFoundError, orderRepository, prisma } from "@nexa/db"
import { NextResponse } from "next/server"
import { wompiGateway } from "@/lib/wompi"

export const dynamic = "force-dynamic"

/**
 * POST /api/webhooks/wompi — la única fuente de verdad del cobro (ADR-0003).
 *
 * El redirect del navegador no confirma nada: el parámetro es manipulable y
 * el cliente puede cerrar la pestaña antes de volver. Lo que manda es esto.
 *
 * Orden de los pasos, que no es negociable:
 *
 *   1. Verificar el checksum. Sin firma válida no se toca la base (RF-12).
 *   2. Registrar el evento con su `event_id` único.
 *   3. Solo entonces aplicar estado e inventario, en una sola transacción.
 *
 * Sobre el punto 2: se deduplica por evento YA PROCESADO, no por evento
 * recibido. Marcar como visto en cuanto llega parece más simple, pero deja
 * un evento que falló a medio aplicar sin posibilidad de reintento — Wompi
 * volvería a mandarlo y lo descartaríamos por duplicado. Como `applyPayment`
 * es idempotente, reprocesar no cuesta nada y no reprocesar sí.
 */
export async function POST(request: Request) {
  const gateway = wompiGateway()
  if (!gateway) {
    console.error("[wompi] la pasarela no está configurada; se descarta el evento")
    return NextResponse.json({ error: "No disponible" }, { status: 503 })
  }

  const body: unknown = await request.json().catch(() => null)

  // RF-12 · evento sin firma válida: 401, se descarta y no se registra nada.
  const verified = gateway.verifyEvent(body)
  if (!verified) {
    console.warn("[wompi] evento con firma inválida descartado")
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 })
  }

  const { transaction, eventId } = verified

  const existing = await prisma.webhookEvent.findUnique({
    where: { eventId },
    select: { id: true, status: true },
  })

  // RF-13 · ya resuelto —aplicado o rechazado en firme—: 200 sin repetir
  // efectos y sin volver a intentarlo.
  if (existing && RESOLVED.has(existing.status)) {
    return NextResponse.json({ ok: true, duplicated: true })
  }

  const record = existing
    ? existing
    : await prisma.webhookEvent
        .create({
          data: {
            eventId,
            payload: body as object,
            signature:
              (body as { signature?: { checksum?: string } })?.signature?.checksum ?? null,
          },
          select: { id: true, status: true },
        })
        // Dos entregas simultáneas del mismo evento: la perdedora relee.
        .catch(async () =>
          prisma.webhookEvent.findUniqueOrThrow({
            where: { eventId },
            select: { id: true, status: true },
          }),
        )

  try {
    const order = await orderRepository.applyPayment(transaction.reference, transaction, body)

    await prisma.webhookEvent.update({
      where: { id: record.id },
      data: { status: "PROCESSED", processedAt: new Date(), error: null },
    })

    return NextResponse.json({ ok: true, order: order.orderNumber, status: order.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Un importe que no cuadra o una orden que no existe no se arreglan
    // reintentando: son definitivos. Devolver 500 ahí solo consigue que
    // Wompi golpee la ruta para siempre por algo que nunca va a cambiar.
    // Un fallo de base de datos, en cambio, sí merece que insista.
    const permanente = error instanceof PaymentError || error instanceof OrderNotFoundError

    console.error(
      `[wompi] evento ${eventId} ${permanente ? "rechazado" : "falló"}: ${message}`,
    )
    await prisma.webhookEvent.update({
      where: { id: record.id },
      data: { status: permanente ? "REJECTED" : "FAILED", error: message.slice(0, 500) },
    })

    // El rechazo queda registrado y auditable, pero se responde 200 para que
    // no se reintente. El 500 se reserva para lo que sí puede salir bien la
    // próxima vez.
    return permanente
      ? NextResponse.json({ ok: false, rejected: message }, { status: 200 })
      : NextResponse.json({ error: "No se pudo procesar el evento" }, { status: 500 })
  }
}

/** Estados que dan el evento por resuelto: no se reprocesa. */
const RESOLVED = new Set(["PROCESSED", "REJECTED"])
