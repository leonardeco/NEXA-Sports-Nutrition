import { prisma } from "@nexa/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Sonda de preparación: si Postgres no responde, el Service no manda
 * tráfico. No sustituye a `/api/alive`, que no depende de la base.
 *
 * Cuando falla dice POR QUÉ. Solo el `code` no basta: los errores de
 * inicialización de Prisma —motor binario ausente, variable sin definir,
 * host inalcanzable— no traen código, y un "unknown" obliga a ir a los logs
 * de la plataforma para saber qué pasó. El mensaje va sin credenciales.
 */
export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
  const hasDirectUrl = Boolean(process.env.DIRECT_URL)
  try {
    await prisma.$queryRaw`SELECT 1 FROM "brands" LIMIT 1`
    return NextResponse.json({ ok: true, db: true, hasDatabaseUrl, hasDirectUrl })
  } catch (error) {
    return NextResponse.json(
      { ok: false, db: false, hasDatabaseUrl, hasDirectUrl, ...describe(error) },
      { status: 503 },
    )
  }
}

/** Nombre, código y mensaje del error, con cualquier credencial tachada. */
function describe(error: unknown): { code: string; name: string; message: string } {
  const e = error as { code?: unknown; name?: unknown; message?: unknown } | null
  const message = String(e?.message ?? error ?? "")
    .replace(/:\/\/[^@\s]+@/g, "://***@")
    .replace(/\s+/g, " ")
    .slice(0, 400)
  return {
    code: e?.code ? String(e.code) : "none",
    name: e?.name ? String(e.name) : typeof error,
    message,
  }
}
