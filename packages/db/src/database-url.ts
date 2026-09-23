// ─────────────────────────────────────────────────────────────────────────
//  Normalización de la cadena de conexión.
//
//  Dos ajustes que hay que hacer antes de dársela a Prisma:
//
//  · Neon a veces entrega `channel_binding=require` y Prisma falla con eso
//    en las funciones de Vercel. Se quita siempre.
//
//  · A un servidor remoto hay que exigirle TLS. A uno local NO: el
//    PostgreSQL del docker-compose y el de CI no lo soportan, y forzarlo
//    hace que Prisma muera con "server does not support TLS" en la primera
//    consulta. Antes se ponía `sslmode=require` a todo, así que la tienda
//    no podía hablar con la base local que el README manda levantar.
// ─────────────────────────────────────────────────────────────────────────

/** Hosts donde exigir TLS solo consigue romper la conexión. */
const HOSTS_LOCALES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  "host.docker.internal",
  // Nombre del servicio dentro de docker-compose y de Kubernetes.
  "postgres",
  "nexa-postgres",
])

export function isLocalHost(hostname: string): boolean {
  const limpio = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (HOSTS_LOCALES.has(limpio) || HOSTS_LOCALES.has(hostname.toLowerCase())) return true
  // `nexa-postgres.nexa.svc.cluster.local` y demás nombres internos.
  return limpio.endsWith(".svc.cluster.local") || limpio.endsWith(".local")
}

/**
 * Devuelve la cadena lista para Prisma, o `undefined` si no hay ninguna
 * configurada —en cuyo caso la tienda sirve el catálogo desde el JSON.
 */
export function resolveDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw || raw.trim() === "") return undefined

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    // Una cadena que no se puede parsear se pasa tal cual: que falle Prisma
    // con su propio mensaje y no nosotros con uno peor.
    return raw
  }

  parsed.searchParams.delete("channel_binding")

  if (!parsed.searchParams.has("sslmode") && !isLocalHost(parsed.hostname)) {
    parsed.searchParams.set("sslmode", "require")
  }

  return parsed.toString()
}
