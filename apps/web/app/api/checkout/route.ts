import { checkoutSchema } from "@nexa/core"
import { orderRepository } from "@nexa/db"
import { NextResponse } from "next/server"
import { errorResponse, invalidRequest, readJson } from "@/lib/api"
import { log } from "@/lib/log"
import { readSession } from "@/lib/session"

export const dynamic = "force-dynamic"

/**
 * POST /api/checkout — convierte el carrito en orden (RF-10, RF-11).
 *
 * Todo el dinero se recalcula aquí dentro desde la base: del cuerpo solo se
 * leen los datos de contacto y de entrega. La reserva de stock y el cambio
 * de estado ocurren en una única transacción dentro del repositorio, de modo
 * que no exista un instante con la orden pendiente y el stock sin apartar
 * (RNF-05).
 *
 * La firma de Wompi se arma en la página de la orden, no aquí: este
 * handler solo crea la orden reservada (RF-16).
 */
export async function POST(request: Request) {
  const sessionId = await readSession()
  if (!sessionId) {
    return NextResponse.json({ error: "No hay un carrito abierto" }, { status: 401 })
  }

  const parsed = checkoutSchema.safeParse(await readJson(request))
  if (!parsed.success) return invalidRequest(parsed.error)

  try {
    const order = await orderRepository.checkout(sessionId, parsed.data)
    log({ event: "checkout.created", order_number: order.orderNumber, status: order.status })
    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
