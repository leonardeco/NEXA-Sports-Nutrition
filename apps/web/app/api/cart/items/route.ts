import { addCartItemSchema } from "@nexa/core"
import { cartRepository } from "@nexa/db"
import { NextResponse } from "next/server"
import { errorResponse, invalidRequest, readJson } from "@/lib/api"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

/**
 * POST /api/cart/items — añade una variante al carrito (RF-05).
 *
 * La cantidad viaja como intención, no como orden: el servidor la recorta al
 * stock disponible y devuelve `capped` para que la interfaz pueda avisar
 * (RF-06). Del cuerpo no se lee ningún precio; el total sale de la base.
 */
export async function POST(request: Request) {
  const parsed = addCartItemSchema.safeParse(await readJson(request))
  if (!parsed.success) return invalidRequest(parsed.error)

  try {
    const sessionId = await requireSession()
    const { cart, capped, available } = await cartRepository.addItem(
      sessionId,
      parsed.data.variantId,
      parsed.data.quantity,
    )
    return NextResponse.json({ cart, capped, available })
  } catch (error) {
    return errorResponse(error)
  }
}
