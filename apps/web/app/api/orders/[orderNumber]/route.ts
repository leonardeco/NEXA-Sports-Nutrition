import { orderRepository } from "@nexa/db"
import { NextResponse } from "next/server"
import { errorResponse } from "@/lib/api"
import { readSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ orderNumber: string }> }

/**
 * GET /api/orders/[orderNumber] — estado de la orden.
 *
 * Lo consulta la página de resultado mientras espera la confirmación del
 * webhook. Devuelve el estado y poco más: no hace falta exponer la dirección
 * de entrega para pintar un indicador de "confirmando".
 *
 * Acotado a la sesión que creó la orden. El número se dicta por WhatsApp y
 * por teléfono, así que por sí solo no puede abrir el pedido de nadie.
 */
export async function GET(_request: Request, { params }: Params) {
  const sessionId = await readSession()
  if (!sessionId) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  try {
    const { orderNumber } = await params
    const order = await orderRepository.findByNumber(orderNumber, sessionId)
    if (!order) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      paidAt: order.paidAt,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
