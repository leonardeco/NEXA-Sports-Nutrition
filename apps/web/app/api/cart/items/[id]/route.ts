import { setCartItemSchema } from "@nexa/core"
import { cartRepository } from "@nexa/db"
import { NextResponse } from "next/server"
import { errorResponse, invalidRequest, readJson } from "@/lib/api"
import { readSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * Sin cookie no hay carrito que modificar. Se usa `readSession` y no
 * `requireSession` a propósito: crear una sesión aquí solo serviría para
 * devolver un 404 sobre un carrito recién inventado.
 */
async function sessionOr401(): Promise<string | NextResponse> {
  const sessionId = await readSession()
  return sessionId ?? NextResponse.json({ error: "No hay un carrito abierto" }, { status: 401 })
}

/** PATCH — fija la cantidad exacta de una línea. Cero la elimina. */
export async function PATCH(request: Request, { params }: Params) {
  const session = await sessionOr401()
  if (session instanceof NextResponse) return session

  const parsed = setCartItemSchema.safeParse(await readJson(request))
  if (!parsed.success) return invalidRequest(parsed.error)

  try {
    const { id } = await params
    const { cart, capped, available } = await cartRepository.setItemQuantity(
      session,
      id,
      parsed.data.quantity,
    )
    return NextResponse.json({ cart, capped, available })
  } catch (error) {
    return errorResponse(error)
  }
}

/** DELETE — quita la línea del carrito. */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await sessionOr401()
  if (session instanceof NextResponse) return session

  try {
    const { id } = await params
    return NextResponse.json({ cart: await cartRepository.removeItem(session, id) })
  } catch (error) {
    return errorResponse(error)
  }
}
