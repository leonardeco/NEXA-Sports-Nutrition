import { describe, expect, it } from "vitest"
import { clientKey, createRateLimiter } from "./rate-limit"

/** Reloj controlado: las pruebas no deben esperar en tiempo real. */
function fakeClock(start = 1_000_000) {
  let value = start
  return {
    now: () => value,
    advance(ms: number) {
      value += ms
    },
  }
}

describe("createRateLimiter", () => {
  it("permite hasta el límite y bloquea la siguiente", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: clock.now })

    expect(limiter.check("a").allowed).toBe(true)
    expect(limiter.check("a").allowed).toBe(true)
    expect(limiter.check("a").allowed).toBe(true)
    expect(limiter.check("a").allowed).toBe(false)
  })

  it("informa cuántas peticiones quedan", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: clock.now })

    expect(limiter.check("a").remaining).toBe(2)
    expect(limiter.check("a").remaining).toBe(1)
    expect(limiter.check("a").remaining).toBe(0)
  })

  it("cuenta cada clave por separado", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now })

    expect(limiter.check("a").allowed).toBe(true)
    expect(limiter.check("b").allowed).toBe(true)
    expect(limiter.check("a").allowed).toBe(false)
  })

  it("es una ventana deslizante, no un cubo que se vacía de golpe", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: clock.now })

    limiter.check("a") // t=0
    clock.advance(30_000)
    limiter.check("a") // t=30s
    expect(limiter.check("a").allowed).toBe(false)

    // A los 61s caduca la primera, así que se libera exactamente un hueco.
    clock.advance(31_000)
    expect(limiter.check("a").allowed).toBe(true)
    expect(limiter.check("a").allowed).toBe(false)
  })

  it("dice cuántos segundos falta esperar", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now })

    limiter.check("a")
    clock.advance(20_000)
    const bloqueada = limiter.check("a")
    expect(bloqueada.allowed).toBe(false)
    expect(bloqueada.retryAfterSeconds).toBe(40)
  })

  it("nunca pide esperar menos de un segundo", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now })

    limiter.check("a")
    clock.advance(59_999)
    expect(limiter.check("a").retryAfterSeconds).toBe(1)
  })

  // Sin esto el mapa crecería con cada IP que pasa y nunca soltaría nada:
  // en un proceso de larga vida es una fuga de memoria.
  it("olvida las claves cuya ventana pasó entera", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: clock.now })

    for (let i = 0; i < 50; i++) limiter.check(`ip-${i}`)
    expect(limiter.size()).toBe(50)

    clock.advance(120_000)
    limiter.check("otra")
    expect(limiter.size()).toBe(1)
  })

  it("no pasa del tope de claves aunque no haya caducado ninguna", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: clock.now, maxKeys: 10 })

    for (let i = 0; i < 40; i++) {
      limiter.check(`ip-${i}`)
      clock.advance(10)
    }
    expect(limiter.size()).toBeLessThanOrEqual(10)
  })

  it("reset vacía el contador", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now })

    limiter.check("a")
    expect(limiter.check("a").allowed).toBe(false)
    limiter.reset()
    expect(limiter.check("a").allowed).toBe(true)
  })

  it("rechaza configuraciones sin sentido", () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1000 })).toThrow(RangeError)
    expect(() => createRateLimiter({ limit: 1.5, windowMs: 1000 })).toThrow(RangeError)
    expect(() => createRateLimiter({ limit: 1, windowMs: 0 })).toThrow(RangeError)
  })
})

describe("clientKey", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("https://nexa.test/api/checkout", { headers })
  }

  it("toma la primera IP de x-forwarded-for", () => {
    expect(clientKey(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe("203.0.113.7")
  })

  it("ignora los espacios alrededor", () => {
    expect(clientKey(req({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7")
  })

  it("cae a x-real-ip si no hay cadena de proxys", () => {
    expect(clientKey(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9")
  })

  it("usa una clave fija en local, donde no hay cabeceras de proxy", () => {
    expect(clientKey(req({}))).toBe("local")
  })

  // Confiar en la última entraría al alcance de quien manda la cabecera.
  it("no se queda con la última de la cadena", () => {
    expect(clientKey(req({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))).not.toBe("9.9.9.9")
  })
})
