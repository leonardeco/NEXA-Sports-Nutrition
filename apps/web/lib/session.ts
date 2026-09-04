import { randomUUID } from "node:crypto"
import { cookies } from "next/headers"

/**
 * Sesión anónima del carrito.
 *
 * La cookie guarda un identificador opaco y aleatorio, nunca el id de la
 * orden: si guardara el id, cambiar la cookie a mano bastaría para abrir el
 * carrito de otra persona. Va `httpOnly` para que ningún script de la página
 * pueda leerla, y `sameSite: lax` para que no viaje en peticiones que
 * origine un tercero.
 */
const COOKIE = "nexa_session"
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/**
 * Lee la sesión sin crearla. Es lo único que puede hacer un Server
 * Component: Next solo permite escribir cookies desde Route Handlers y
 * Server Actions. Sin cookie no hay carrito, que es la respuesta correcta
 * para quien todavía no ha añadido nada.
 */
export async function readSession(): Promise<string | null> {
  const store = await cookies()
  return store.get(COOKIE)?.value ?? null
}

/** Devuelve la sesión y la crea si hace falta. Solo desde un Route Handler. */
export async function requireSession(): Promise<string> {
  const store = await cookies()
  const existing = store.get(COOKIE)?.value
  if (existing) return existing

  const sessionId = randomUUID()
  store.set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
  return sessionId
}
