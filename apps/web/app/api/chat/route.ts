import { AssistantError, chatTurnSchema } from "@nexa/core"
import { cartRepository, chatRepository, productRepository } from "@nexa/db"
import { NextResponse } from "next/server"
import { errorResponse, invalidRequest, readJson } from "@/lib/api"
import { AssistantConfigError, handleAssistantTurn } from "@/lib/assistant"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const hits = new Map<string, number[]>()

function allow(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((stamp) => now - stamp < 60_000)
  if (recent.length >= 10) {
    hits.set(ip, recent)
    return false
  }
  recent.push(now)
  hits.set(ip, recent)
  return true
}

/**
 * POST /api/chat — un turno del asesor de ventas (RF-17 a RF-21).
 *
 * El cuerpo solo trae el mensaje. Precio, stock y disponibilidad salen de
 * las herramientas, nunca del cliente. Sin ANTHROPIC_API_KEY la tienda
 * sigue en pie: se responde 503 y se ofrece WhatsApp (RNF-03).
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  if (!allow(ip)) {
    return NextResponse.json(
      { error: "Demasiados mensajes seguidos. Espera un momento o escríbenos por WhatsApp." },
      { status: 429 },
    )
  }

  const parsed = chatTurnSchema.safeParse(await readJson(request))
  if (!parsed.success) return invalidRequest(parsed.error)

  try {
    const sessionId = await requireSession()
    const reply = await handleAssistantTurn(parsed.data.message, {
      sessionId,
      products: productRepository,
      carts: cartRepository,
      chats: chatRepository,
    })
    return NextResponse.json(reply)
  } catch (error) {
    if (error instanceof AssistantConfigError) {
      return NextResponse.json(
        {
          error:
            "El asesor no está disponible ahora. Escríbenos por WhatsApp y te atendemos.",
        },
        { status: 503 },
      )
    }
    if (error instanceof AssistantError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "budget" || error.code === "escalated" ? 409 : 400 },
      )
    }
    return errorResponse(error)
  }
}
