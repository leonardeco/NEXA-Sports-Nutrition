import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"

/**
 * Sesión del panel de administración.
 *
 * El testigo es `adminId.vencimiento.firma`, firmado con HMAC-SHA256 contra
 * un secreto del entorno. No se guarda en base de datos: para un operador
 * único, una sesión firmada con vencimiento corto basta y ahorra una tabla
 * y una consulta por petición.
 *
 * Sin `ADMIN_SESSION_SECRET` configurado no se emite ni se acepta ninguna
 * sesión. Es deliberado: un panel abierto por falta de configuración es peor
 * que un panel inaccesible.
 */
const COOKIE = "nexa_admin"
const MAX_AGE_SECONDS = 60 * 60 * 8

function secret(): string | null {
  const value = process.env.ADMIN_SESSION_SECRET
  return value && value.length >= 32 ? value : null
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

export function issueToken(adminId: string): string | null {
  const key = secret()
  if (!key) return null

  const payload = `${adminId}.${Date.now() + MAX_AGE_SECONDS * 1000}`
  return `${payload}.${sign(payload, key)}`
}

/** Devuelve el id del administrador si el testigo es válido y no venció. */
export function verifyToken(token: string): string | null {
  const key = secret()
  if (!key) return null

  const [adminId, expiresAt, signature] = token.split(".")
  if (!adminId || !expiresAt || !signature) return null

  const expected = Buffer.from(sign(`${adminId}.${expiresAt}`, key))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  return Number(expiresAt) > Date.now() ? adminId : null
}

export async function readAdmin(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value
  return token ? verifyToken(token) : null
}

/**
 * RF-24 · SI un usuario no autenticado solicita una ruta de administración,
 * ENTONCES EL SISTEMA responde 404 sin revelar su existencia.
 *
 * `notFound()` y no un redirect ni un 401: para quien no tiene sesión,
 * /admin es indistinguible de una URL que nunca existió.
 */
export async function requireAdmin(): Promise<string> {
  const adminId = await readAdmin()
  if (!adminId) notFound()
  return adminId
}

export async function startAdminSession(adminId: string): Promise<boolean> {
  const token = issueToken(adminId)
  if (!token) return false

  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
  return true
}

export async function endAdminSession(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}
