// ─────────────────────────────────────────────────────────────────────────
//  Registro estructurado — RNF-07
//
//  Una línea JSON por evento. La clave que permite seguir un cobro de
//  punta a punta es `order_number`; si un evento no la trae, no es de
//  cobro. Nada de secretos, cookies ni cuerpos de webhook.
// ─────────────────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error"

export interface LogEvent {
  readonly event: string
  readonly level?: LogLevel
  readonly order_number?: string
  readonly [key: string]: unknown
}

const REDACTED = new Set([
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "signature",
  "payload",
  "apikey",
  "api_key",
  "private_key",
  "integrity",
])

function sanitize(value: unknown, key?: string): unknown {
  if (key && REDACTED.has(key.toLowerCase())) return "[redacted]"
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item) => sanitize(item))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = sanitize(v, k)
  }
  return out
}

export function log(entry: LogEvent): void {
  const level = entry.level ?? "info"
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...sanitize(entry) as object,
  })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.warn(line)
}
