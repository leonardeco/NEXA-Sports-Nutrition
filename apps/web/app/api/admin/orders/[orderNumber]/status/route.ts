import { changeOrderStatusSchema } from "@nexa/core"
import { orderRepository } from "@nexa/db"
import { NextResponse } from "next/server"
import { errorResponse, invalidRequest, readJson } from "@/lib/api"
import { readAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ orderNumber: string }> }

/**
 * PATCH — transición manual desde el panel.
 *
 * Sin sesión responde 404, no 401, por coherencia con RF-24: la ruta no
 * admite que existe. Quien decide si la transición es legal es la máquina de
 * estados del dominio, no esta capa; aquí solo se traduce su negativa a un
 * 409.
 */
export async function PATCH(request: Request, { params }: Params) {
  if (!(await readAdmin())) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  }

  const parsed = changeOrderStatusSchema.safeParse(await readJson(request))
  if (!parsed.success) return invalidRequest(parsed.error)

  try {
    const { orderNumber } = await params
    const order = await orderRepository.findByNumber(orderNumber)
    if (!order) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

    return NextResponse.json({
      order: await orderRepository.changeStatus(order.id, parsed.data.status),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
