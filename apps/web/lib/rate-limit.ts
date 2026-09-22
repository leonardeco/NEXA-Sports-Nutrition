// ─────────────────────────────────────────────────────────────────────────
//  Limitación de peticiones por cliente
//
//  Por qué existe: `/api/checkout` no solo crea una orden, **reserva stock**
//  durante 30 minutos (RESERVATION_TTL_MINUTES), y el cron que libera las
//  reservas vencidas corre una vez al día por el plan Hobby de Vercel. Sin
//  freno, un script puede apartar el inventario entero sin pagar y dejarlo
//  retenido hasta 24 horas.
//
//  LÍMITE CONOCIDO: el contador vive en memoria del proceso. En Vercel cada
//  instancia serverless tiene el suyo, así que esto frena el abuso desde una
//  sola máquina, no uno repartido entre muchas. El contador compartido con
//  Upstash Redis que contempla el ADS necesita cuenta; `RateLimiter` es la
//  interfaz que ese adaptador tendrá que cumplir, así que cambiarlo no toca
//  ninguna ruta.
// ─────────────────────────────────────────────────────────────────────────

export interface RateLimitDecision {
  readonly allowed: boolean
  /** Peticiones que aún caben en la ventana. */
  readonly remaining: number
  /** Segundos que faltan para que se libere un hueco. 0 si se permitió. */
  readonly retryAfterSeconds: number
}

export interface RateLimiter {
  check(key: string): RateLimitDecision
  reset(): void
  /** Claves vivas. Solo para las pruebas: vigila que no haya fuga. */
  size(): number
}

export interface RateLimiterOptions {
  /** Peticiones permitidas dentro de la ventana. */
  readonly limit: number
  readonly windowMs: number
  /** Inyectable para poder probar sin esperar en tiempo real. */
  readonly now?: () => number
  /**
   * Tope de claves distintas. Una IP falsificada por petición haría crecer
   * el mapa sin fin; al pasarse se descarta la clave que lleva más tiempo
   * sin usarse.
   */
  readonly maxKeys?: number
}

const DEFAULT_MAX_KEYS = 5_000

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxKeys = DEFAULT_MAX_KEYS,
}: RateLimiterOptions): RateLimiter {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`El límite debe ser un entero positivo, se recibió ${limit}`)
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError(`La ventana debe ser positiva, se recibió ${windowMs}`)
  }

  const hits = new Map<string, number[]>()
  let lastSweep = now()

  /** Borra las claves cuya ventana ya pasó entera. */
  function sweep(current: number): void {
    for (const [key, stamps] of hits) {
      const last = stamps[stamps.length - 1]
      if (last === undefined || current - last >= windowMs) hits.delete(key)
    }
    lastSweep = current
  }

  function evictLeastRecent(): void {
    let oldestKey: string | null = null
    let oldestStamp = Number.POSITIVE_INFINITY
    for (const [key, stamps] of hits) {
      const last = stamps[stamps.length - 1] ?? 0
      if (last < oldestStamp) {
        oldestStamp = last
        oldestKey = key
      }
    }
    if (oldestKey !== null) hits.delete(oldestKey)
  }

  return {
    check(key: string): RateLimitDecision {
      const current = now()
      if (current - lastSweep >= windowMs) sweep(current)

      const recent = (hits.get(key) ?? []).filter((stamp) => current - stamp < windowMs)

      if (recent.length >= limit) {
        hits.set(key, recent)
        const oldest = recent[0] ?? current
        const restanteMs = windowMs - (current - oldest)
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil(restanteMs / 1000)),
        }
      }

      recent.push(current)
      hits.set(key, recent)
      if (hits.size > maxKeys) evictLeastRecent()

      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 }
    },

    reset(): void {
      hits.clear()
      lastSweep = now()
    },

    size(): number {
      return hits.size
    },
  }
}

/**
 * Identifica al cliente. Detrás de Vercel la IP real es la primera de
 * `x-forwarded-for`; el resto de la lista son los proxys por los que pasó y
 * confiar en la última permitiría falsificarla.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const first = forwarded?.split(",")[0]?.trim()
  if (first) return first
  return request.headers.get("x-real-ip")?.trim() || "local"
}
