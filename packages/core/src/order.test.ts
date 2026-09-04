import { describe, expect, it } from "vitest"
import {
  ORDER_NUMBER_ENTROPY_BYTES,
  OrderError,
  RESERVATION_TTL_MINUTES,
  assertTransition,
  buildOrderNumber,
  canTransition,
  holdsStock,
  isReservationExpired,
  isTerminal,
  nextStatuses,
  reservationExpiresAt,
} from "./order"
import type { OrderStatus } from "./ports"

const ALL_STATUSES: readonly OrderStatus[] = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PAID",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "PAYMENT_FAILED",
  "EXPIRED",
  "REFUNDED",
]

describe("máquina de estados", () => {
  it("permite el camino feliz completo", () => {
    expect(canTransition("DRAFT", "PENDING_PAYMENT")).toBe(true)
    expect(canTransition("PENDING_PAYMENT", "PAID")).toBe(true)
    expect(canTransition("PAID", "PREPARING")).toBe(true)
    expect(canTransition("PREPARING", "SHIPPED")).toBe(true)
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true)
  })

  it("no deja saltar de DRAFT a PAID sin reservar stock", () => {
    expect(canTransition("DRAFT", "PAID")).toBe(false)
    expect(() => assertTransition("DRAFT", "PAID")).toThrow(OrderError)
  })

  it("permite expirar y fallar el pago desde PENDING_PAYMENT", () => {
    expect(canTransition("PENDING_PAYMENT", "EXPIRED")).toBe(true)
    expect(canTransition("PENDING_PAYMENT", "PAYMENT_FAILED")).toBe(true)
  })

  it("deja reintentar el pago tras un fallo", () => {
    expect(canTransition("PAYMENT_FAILED", "PENDING_PAYMENT")).toBe(true)
  })

  it("no reabre una orden expirada ni con un webhook tardío", () => {
    expect(canTransition("EXPIRED", "PAID")).toBe(false)
    expect(canTransition("EXPIRED", "PENDING_PAYMENT")).toBe(false)
  })

  it("no permite volver atrás en el flujo de despacho", () => {
    expect(canTransition("SHIPPED", "PREPARING")).toBe(false)
    expect(canTransition("DELIVERED", "SHIPPED")).toBe(false)
    expect(canTransition("PAID", "PENDING_PAYMENT")).toBe(false)
  })

  it("no permite quedarse en el mismo estado", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false)
    }
  })

  it("reconoce los estados terminales", () => {
    expect(isTerminal("EXPIRED")).toBe(true)
    expect(isTerminal("CANCELLED")).toBe(true)
    expect(isTerminal("REFUNDED")).toBe(true)
    expect(isTerminal("DRAFT")).toBe(false)
    expect(isTerminal("DELIVERED")).toBe(false)
  })

  it("declara transiciones para todos los estados del enum", () => {
    for (const status of ALL_STATUSES) {
      expect(Array.isArray(nextStatuses(status))).toBe(true)
    }
  })

  it("no ofrece transiciones desde un estado terminal", () => {
    expect(nextStatuses("CANCELLED")).toHaveLength(0)
  })
})

describe("holdsStock", () => {
  it("solo PENDING_PAYMENT retiene stock (RF-08)", () => {
    expect(holdsStock("PENDING_PAYMENT")).toBe(true)
    for (const status of ALL_STATUSES.filter((s) => s !== "PENDING_PAYMENT")) {
      expect(holdsStock(status)).toBe(false)
    }
  })

  it("un carrito abierto no reserva nada", () => {
    // Si DRAFT reservara, bastaría con dejar carritos abiertos para agotar
    // la tienda sin comprar nada.
    expect(holdsStock("DRAFT")).toBe(false)
  })
})

describe("reserva", () => {
  const t0 = new Date("2026-09-03T10:00:00.000Z")

  it("vence a los 30 minutos por defecto (RF-09)", () => {
    expect(RESERVATION_TTL_MINUTES).toBe(30)
    expect(reservationExpiresAt(t0).toISOString()).toBe("2026-09-03T10:30:00.000Z")
  })

  it("acepta un plazo distinto", () => {
    expect(reservationExpiresAt(t0, 5).toISOString()).toBe("2026-09-03T10:05:00.000Z")
  })

  it("rechaza plazos no positivos", () => {
    expect(() => reservationExpiresAt(t0, 0)).toThrow(OrderError)
    expect(() => reservationExpiresAt(t0, -10)).toThrow(OrderError)
  })

  it("no está vencida un segundo antes", () => {
    const expiresAt = reservationExpiresAt(t0)
    expect(isReservationExpired(expiresAt, new Date("2026-09-03T10:29:59.000Z"))).toBe(false)
  })

  it("está vencida en el minuto exacto", () => {
    const expiresAt = reservationExpiresAt(t0)
    expect(isReservationExpired(expiresAt, new Date("2026-09-03T10:30:00.000Z"))).toBe(true)
  })
})

describe("buildOrderNumber", () => {
  const entropy = Uint8Array.from([0, 1, 2, 3, 4, 5])

  it("compone prefijo, fecha y sufijo", () => {
    const number = buildOrderNumber(new Date("2026-09-03T15:00:00.000Z"), entropy)
    expect(number).toBe("NEXA-260903-012345")
  })

  it("usa la fecha de Bogotá y no la de UTC", () => {
    // 03/09 a las 20:00 en Bogotá son las 01:00 UTC del día 4. El cliente
    // lee su número: tiene que decir 03, no 04.
    const number = buildOrderNumber(new Date("2026-09-04T01:00:00.000Z"), entropy)
    expect(number).toBe("NEXA-260903-012345")
  })

  it("mapea la entropía al alfabeto de Crockford", () => {
    const number = buildOrderNumber(
      new Date("2026-09-03T15:00:00.000Z"),
      Uint8Array.from([10, 11, 12, 13, 14, 15]),
    )
    expect(number).toBe("NEXA-260903-ABCDEF")
  })

  it("evita los caracteres ambiguos I, L, O y U", () => {
    const alphabet = new Set<string>()
    for (let byte = 0; byte < 32; byte += 1) {
      const number = buildOrderNumber(
        new Date("2026-09-03T15:00:00.000Z"),
        Uint8Array.from([byte, byte, byte, byte, byte, byte]),
      )
      alphabet.add(number.slice(-1))
    }
    for (const ambiguous of ["I", "L", "O", "U"]) {
      expect(alphabet.has(ambiguous)).toBe(false)
    }
  })

  it("envuelve bytes mayores que el alfabeto", () => {
    const number = buildOrderNumber(
      new Date("2026-09-03T15:00:00.000Z"),
      Uint8Array.from([32, 33, 255, 0, 0, 0]),
    )
    expect(number).toBe("NEXA-260903-01Z000")
  })

  it("rechaza entropía insuficiente", () => {
    expect(() =>
      buildOrderNumber(new Date("2026-09-03T15:00:00.000Z"), Uint8Array.from([1, 2])),
    ).toThrow(OrderError)
  })

  it("rechaza una fecha inválida", () => {
    expect(() => buildOrderNumber(new Date("no es una fecha"), entropy)).toThrow(OrderError)
  })

  it("declara cuántos bytes de entropía necesita", () => {
    expect(ORDER_NUMBER_ENTROPY_BYTES).toBe(6)
  })
})
