import { orderRepository } from "@nexa/db"
import { NextResponse } from "next/server"
import { errorResponse } from "@/lib/api"

export const dynamic = "force-dynamic"

/**
 * RF-09 · libera las reservas vencidas y marca las órdenes como EXPIRED.
 *
 * Pensado para un cron que lo llame cada pocos minutos. Sin él, una orden
 * abandonada retendría su stock para siempre y el catálogo se iría quedando
 * sin existencias que en realidad están ahí.
 *
 * Va protegido por un secreto compartido en `Authorization: Bearer` porque
 * es una ruta pública que produce efectos. Si el secreto no está configurado
 * la ruta se niega a correr: es preferible un cron caído y visible a un
 * endpoint de escritura abierto a cualquiera.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron] CRON_SECRET no está configurado; no se expira nada")
    return NextResponse.json({ error: "No disponible" }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    // La cuenta va en la respuesta, que es lo que lee quien monitorea; no
    // hace falta además una línea de log por cada pasada en vacío.
    return NextResponse.json({ expired: await orderRepository.expireStale(new Date()) })
  } catch (error) {
    return errorResponse(error)
  }
}
