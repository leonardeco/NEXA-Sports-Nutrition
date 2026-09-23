import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// `next/headers` solo existe dentro de una petición de Next. Se sustituye
// por un almacén de cookies de mentira para poder probar lo que importa:
// que la sesión es opaca y que la cookie sale con las banderas correctas.
const almacen = new Map<string, { value: string }>()
const set = vi.fn<(nombre: string, valor: string, opciones: Record<string, unknown>) => void>()

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nombre: string) => almacen.get(nombre),
    set,
  }),
}))

const { readSession, requireSession } = await import("./session")

const COOKIE = "nexa_session"

beforeEach(() => {
  almacen.clear()
  set.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("readSession", () => {
  it("sin cookie no hay carrito", async () => {
    expect(await readSession()).toBeNull()
  })

  it("devuelve la sesión existente", async () => {
    almacen.set(COOKIE, { value: "sesion-1" })
    expect(await readSession()).toBe("sesion-1")
  })

  // Es lo único que puede hacer un Server Component: Next solo permite
  // escribir cookies desde Route Handlers y Server Actions.
  it("nunca crea una sesión al leer", async () => {
    await readSession()
    expect(set).not.toHaveBeenCalled()
  })
})

describe("requireSession", () => {
  it("reutiliza la sesión que ya hay, sin reescribir la cookie", async () => {
    almacen.set(COOKIE, { value: "sesion-1" })
    expect(await requireSession()).toBe("sesion-1")
    expect(set).not.toHaveBeenCalled()
  })

  it("crea una sesión cuando no hay", async () => {
    const id = await requireSession()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(set).toHaveBeenCalledOnce()
    expect(set.mock.calls[0]?.[0]).toBe(COOKIE)
    expect(set.mock.calls[0]?.[1]).toBe(id)
  })

  // Dos personas distintas no pueden acabar compartiendo carrito.
  it("cada sesión nueva es distinta", async () => {
    const a = await requireSession()
    almacen.clear()
    const b = await requireSession()
    expect(a).not.toBe(b)
  })

  describe("banderas de la cookie", () => {
    async function opciones(): Promise<Record<string, unknown>> {
      await requireSession()
      return set.mock.calls[0]?.[2] ?? {}
    }

    // Sin httpOnly, cualquier script de la página podría robar el carrito.
    it("va httpOnly", async () => {
      expect((await opciones()).httpOnly).toBe(true)
    })

    // Con `lax` no viaja en peticiones que origine un tercero.
    it("va sameSite lax", async () => {
      expect((await opciones()).sameSite).toBe("lax")
    })

    it("vale para todo el sitio y dura 30 días", async () => {
      const o = await opciones()
      expect(o.path).toBe("/")
      expect(o.maxAge).toBe(60 * 60 * 24 * 30)
    })

    it("va secure en producción", async () => {
      vi.stubEnv("NODE_ENV", "production")
      expect((await opciones()).secure).toBe(true)
    })

    // En local no hay TLS: con `secure` el navegador descartaría la cookie
    // y nadie podría usar el carrito.
    it("no va secure fuera de producción", async () => {
      vi.stubEnv("NODE_ENV", "development")
      expect((await opciones()).secure).toBe(false)
    })
  })
})
