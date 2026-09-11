import { prisma } from "@nexa/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Sonda de preparación: si Postgres no responde, el Service no manda
 * tráfico. No sustituye a `/api/alive`, que no depende de la base.
 */
export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
  const hasDirectUrl = Boolean(process.env.DIRECT_URL)
  try {
    await prisma.$queryRaw`SELECT 1 FROM "brands" LIMIT 1`
    return NextResponse.json({ ok: true, db: true, hasDatabaseUrl, hasDirectUrl })
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : "unknown"
    return NextResponse.json(
      { ok: false, db: false, hasDatabaseUrl, hasDirectUrl, code },
      { status: 503 },
    )
  }
}
