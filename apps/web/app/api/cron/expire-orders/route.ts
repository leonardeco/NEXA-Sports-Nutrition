import { orderRepository } from "@nexa/db"
import { NextResponse } from "next/server"
import { errorResponse } from "@/lib/api"
import { wompiGateway } from "@/lib/wompi"

export const dynamic = "force-dynamic"

/**
 * RF-09 · libera las reservas vencidas y marca las órdenes como EXPIRED.
 *
 * Sin esto, una orden abandonada retendría su stock para siempre y el
 * catálogo se iría quedando sin existencias que en realidad están ahí.
 *
 * Va protegido por un secreto compartido en `Authorization: Bearer` porque
 * es una ruta pública que produce efectos. Si el secreto no está
 * configurado, la ruta se niega a correr: es preferible un cron caído y
 * visible que un endpoint de escritura abierto a cualquiera.
 */
async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron] CRON_SECRET no está configurado; no se expira nada")
    return NextResponse.json({ error: "No disponible" }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    // RF-15 · antes de expirar nada se le pregunta a Wompi por el estado
    // real. Es el caso del webhook que nunca llegó: si se expirara sin
    // preguntar, el cliente quedaría cobrado y sin pedido.
    const gateway = wompiGateway()
    const reconcile = gateway ? gateway.reconcile.bind(gateway) : undefined

    // Las cuentas van en la respuesta, que es lo que lee quien monitorea;
    // no hace falta además una línea de log por cada pasada en vacío.
    return NextResponse.json(await orderRepository.expireStale(new Date(), reconcile))
  } catch (error) {
    return errorResponse(error)
  }
}

/** Vercel Cron invoca por GET y pone él mismo la cabecera Authorization. */
export const GET = handle

/** POST queda para invocarlo a mano o desde otro planificador. */
export const POST = handle
