import { prisma } from "@nexa/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Sonda de preparación: si Postgres no responde, el Service no manda
 * tráfico. No sustituye a `/api/alive`, que no depende de la base.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "brands" LIMIT 1`
    return NextResponse.json({ ok: true, db: true })
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 })
  }
}
