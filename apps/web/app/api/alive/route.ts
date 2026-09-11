import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/** Proceso arriba, sin tocar la base. Sonda de vida del contenedor. */
export async function GET() {
  return NextResponse.json({ ok: true })
}
