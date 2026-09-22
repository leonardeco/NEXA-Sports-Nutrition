import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Proceso arriba, sin tocar la base. Sonda de vida del contenedor.
 *
 * Devuelve también qué commit está sirviendo. Sin esto, cuando un
 * despliegue falla y Vercel deja el anterior en pie, no hay forma de
 * distinguir "el arreglo no funcionó" de "el arreglo no ha llegado" sin
 * entrar al panel — y son dos problemas completamente distintos.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  })
}
