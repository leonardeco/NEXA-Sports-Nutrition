import { AdminProductError, CartError, OrderError } from "@nexa/core"
import {
  CartNotFoundError,
  CheckoutError,
  InsufficientStockError,
  InventoryError,
  OrderNotFoundError,
} from "@nexa/db"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { errorResponse, invalidRequest, readJson, tooManyRequests } from "./api"

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe("errorResponse", () => {
  it("traduce falta de stock a 409 y dice cuánto queda", async () => {
    const response = errorResponse(new InsufficientStockError("var-1", 5, 2))
    expect(response.status).toBe(409)
    const json = await body(response)
    expect(json.available).toBe(2)
    expect(String(json.error)).toContain("stock")
  })

  // El caso concreto tiene que ganar al general: InsufficientStockError
  // hereda de InventoryError, y si se comprobara al reves el cliente nunca
  // sabria cuantas unidades quedan.
  it("distingue la falta de stock del resto de problemas de inventario", async () => {
    const concreto = errorResponse(new InsufficientStockError("var-1", 5, 2))
    expect((await body(concreto)).available).toBe(2)

    const general = errorResponse(new InventoryError("La variante var-1 no existe"))
    expect(general.status).toBe(409)
    expect((await body(general)).available).toBeUndefined()
  })

  // Pasa cuando una variante deja de existir entre anadirla al carrito y
  // pagar. No es un fallo del servidor, asi que 409 y no 500.
  it("no filtra el mensaje interno de un problema de inventario", async () => {
    const response = errorResponse(new InventoryError("La variante clx9f2a0001 no existe"))
    const json = await body(response)
    expect(String(json.error)).not.toContain("clx9f2a0001")
    expect(String(json.error)).toContain("disponible")
  })

  it("traduce carrito y orden inexistentes a 404", () => {
    expect(errorResponse(new CartNotFoundError()).status).toBe(404)
    expect(errorResponse(new OrderNotFoundError("ORD-1")).status).toBe(404)
  })

  it("traduce errores de checkout y de carrito a 400", () => {
    expect(errorResponse(new CheckoutError("El carrito está vacío")).status).toBe(400)
    expect(errorResponse(new CartError("Cantidad inválida")).status).toBe(400)
  })

  // No es un error de sintaxis: el recurso está en un estado que no admite
  // lo que se pide, así que 409 y no 400.
  it("traduce una transición de estado no permitida a 409", () => {
    expect(errorResponse(new OrderError("No se puede enviar una orden sin pagar")).status).toBe(409)
  })

  it("distingue el producto que no existe del cambio que no se puede aplicar", () => {
    expect(errorResponse(new AdminProductError("No encontrado")).status).toBe(404)
    expect(errorResponse(new AdminProductError("Otra cosa")).status).toBe(409)
  })

  it("conserva el mensaje de los errores de dominio, que son para el cliente", async () => {
    const response = errorResponse(new CheckoutError("El carrito está vacío"))
    expect((await body(response)).error).toBe("El carrito está vacío")
  })

  // Lo que no esté enumerado es un fallo que no habíamos previsto: sale como
  // 500 genérico para no filtrarle al cliente el interior del sistema.
  it("no filtra el mensaje de un error imprevisto", async () => {
    const response = errorResponse(new Error("connect ECONNREFUSED 10.0.0.4:5432"))
    expect(response.status).toBe(500)
    const json = await body(response)
    expect(String(json.error)).not.toContain("ECONNREFUSED")
    expect(String(json.error)).not.toContain("10.0.0.4")
  })

  it("aguanta que le tiren algo que ni siquiera es un Error", async () => {
    for (const raro of [null, undefined, "texto", 42, { a: 1 }]) {
      const response = errorResponse(raro)
      expect(response.status).toBe(500)
      expect(typeof (await body(response)).error).toBe("string")
    }
  })
})

describe("invalidRequest", () => {
  it("devuelve 400 con el primer problema de validación", async () => {
    const parsed = z.object({ quantity: z.number().int("Tiene que ser entero") }).safeParse({
      quantity: 1.5,
    })
    expect(parsed.success).toBe(false)
    if (parsed.success) return

    const response = invalidRequest(parsed.error)
    expect(response.status).toBe(400)
    expect((await body(response)).error).toBe("Tiene que ser entero")
  })
})

describe("tooManyRequests", () => {
  it("devuelve 429 con la cabecera Retry-After", async () => {
    const response = tooManyRequests("Espera un momento", 42)
    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("42")
    const json = await body(response)
    expect(json.error).toBe("Espera un momento")
    expect(json.retryAfterSeconds).toBe(42)
  })
})

describe("readJson", () => {
  it("lee un cuerpo JSON normal", async () => {
    const request = new Request("https://nexa.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity: 2 }),
    })
    expect(await readJson(request)).toEqual({ quantity: 2 })
  })

  // Un cuerpo ilegible es entrada del cliente, no un fallo nuestro: devuelve
  // null para que el esquema lo rechace con un 400 en vez de reventar.
  it("devuelve null con un cuerpo roto en vez de lanzar", async () => {
    const request = new Request("https://nexa.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ esto no es json",
    })
    expect(await readJson(request)).toBeNull()
  })

  it("devuelve null con un cuerpo vacío", async () => {
    const request = new Request("https://nexa.test/api", { method: "POST" })
    expect(await readJson(request)).toBeNull()
  })
})
