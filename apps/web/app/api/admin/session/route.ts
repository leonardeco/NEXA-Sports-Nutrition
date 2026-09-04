import { prisma, verifyPassword } from "@nexa/db"
import { NextResponse } from "next/server"
import { z } from "zod"
import { invalidRequest, readJson } from "@/lib/api"
import { endAdminSession, startAdminSession } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

const credentialsSchema = z.object({
  email: z.string().trim().email("Credenciales incorrectas").max(160),
  password: z.string().min(1, "Credenciales incorrectas").max(200),
})

/**
 * Un único mensaje para correo inexistente y contraseña equivocada: decir
 * cuál de los dos falló convierte el formulario en un buscador de correos
 * válidos.
 *
 * Es una función y no una constante porque el cuerpo de una NextResponse es
 * un stream de un solo uso: compartir la misma instancia entre peticiones
 * deja sin cuerpo a todas menos la primera.
 */
function rejected(): NextResponse {
  return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 })
}

export async function POST(request: Request) {
  const parsed = credentialsSchema.safeParse(await readJson(request))
  if (!parsed.success) return invalidRequest(parsed.error)

  const admin = await prisma.adminUser.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  })

  // Se verifica siempre, incluso sin usuario, contra un hash de descarte:
  // así el tiempo de respuesta no delata qué correos existen.
  const hash = admin?.passwordHash ?? DUMMY_HASH
  const ok = await verifyPassword(parsed.data.password, hash)
  if (!admin || !ok) return rejected()

  if (!(await startAdminSession(admin.id))) {
    console.error("[admin] ADMIN_SESSION_SECRET no está configurado")
    return NextResponse.json({ error: "El acceso no está disponible" }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  await endAdminSession()
  return NextResponse.json({ ok: true })
}

/** Hash con la forma correcta, para gastar el mismo tiempo sin usuario. */
const DUMMY_HASH = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`
