import type { Metadata } from "next"
import { Money, type OrderStatus } from "@nexa/core"
import { orderRepository } from "@nexa/db"
import Link from "next/link"
import { notFound } from "next/navigation"
import { STORE, whatsappLink } from "@/lib/config"
import { readSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
}

type Params = Promise<{ orderNumber: string }>

/** Cómo se le nombra cada estado al cliente, no al operador. */
const ESTADO: Record<OrderStatus, string> = {
  DRAFT: "Sin confirmar",
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  PREPARING: "En preparación",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  PAYMENT_FAILED: "El pago no se completó",
  EXPIRED: "Caducado",
  REFUNDED: "Reembolsado",
}

export default async function OrdenPage({ params }: { params: Params }) {
  const { orderNumber } = await params

  // Acotado a la sesión: el número por sí solo no abre el pedido de nadie.
  const sessionId = await readSession()
  const order = sessionId ? await orderRepository.findByNumber(orderNumber, sessionId) : null
  if (!order) notFound()

  const pendiente = order.status === "PENDING_PAYMENT"
  const mensaje = `Hola, acabo de crear el pedido *${order.orderNumber}* por ${Money.format(order.totalCents)}. Quiero coordinar el pago.`

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <p
        className="text-[0.7rem] font-medium tracking-[0.16em] uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {ESTADO[order.status]}
      </p>
      <h1 className="mt-2 text-3xl font-bold">
        {pendiente ? "Tu pedido está reservado" : "Tu pedido"}
      </h1>
      <p className="mt-2 font-mono text-sm" style={{ color: "var(--text-secondary)" }}>
        {order.orderNumber}
      </p>

      {pendiente && order.expiresAt && (
        <p
          className="mt-5 border px-4 py-3 text-sm"
          style={{ borderColor: "var(--color-nexa-warning)" }}
        >
          Guardamos tus unidades hasta las{" "}
          <strong>
            {/* 24 horas: "11:37 p. m." acaba en punto y choca con el de la
                frase, y para un vencimiento la hora exacta se lee mejor. */}
            {order.expiresAt.toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "America/Bogota",
            })}
          </strong>
          . Pasado ese momento el stock vuelve al catálogo y tendrás que hacer el pedido de
          nuevo.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-[0.16em] uppercase">Productos</h2>
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-4 py-3 text-sm">
              <span>
                <Link href={`/producto/${line.productSlug}`} className="hover:underline">
                  {line.productName}
                </Link>
                <span style={{ color: "var(--text-muted)" }}> × {line.quantity}</span>
              </span>
              <span className="shrink-0 tabular-nums">{Money.format(line.lineTotalCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Subtotal">{Money.format(order.subtotalCents)}</Row>
          <Row label="Envío">{Money.format(order.shippingCents)}</Row>
        </dl>
        <div
          className="mt-3 flex items-baseline justify-between border-t pt-3"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <span className="font-semibold">Total</span>
          <span
            className="text-2xl font-bold tabular-nums"
            style={{ color: "var(--color-nexa-orange)" }}
          >
            {Money.format(order.totalCents)}
          </span>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-[0.16em] uppercase">Entrega</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {order.shippingAddress}
          {order.shippingCity ? `, ${order.shippingCity}` : ""}
          {order.notes ? ` · ${order.notes}` : ""}
        </p>
      </section>

      {/* RF-16 · el traspaso a un humano conserva el número de orden. */}
      <a
        href={whatsappLink(mensaje)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-block px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase"
        style={{ background: "var(--color-nexa-whatsapp)" }}
      >
        Coordinar el pago por WhatsApp
      </a>
      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        Te escribimos al {STORE.whatsappDisplay}. El pago en línea con Wompi llega en la
        siguiente fase.
      </p>
    </main>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt style={{ color: "var(--text-secondary)" }}>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  )
}
