import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { Money } from "./money"
import {
  PaymentError,
  assertPayable,
  eventChecksumPayload,
  eventIdFor,
  integrityPayload,
  orderStatusForTransaction,
  wompiEventSchema,
  type WompiEvent,
} from "./payment"

const INTEGRITY_SECRET = "test_integrity_secret"
const EVENTS_SECRET = "test_events_secret"

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex")

function event(overrides: Partial<WompiEvent> = {}): WompiEvent {
  return wompiEventSchema.parse({
    event: "transaction.updated",
    data: {
      transaction: {
        id: "01-1532941443-49201",
        reference: "NEXA-260903-K7F2QX",
        status: "APPROVED",
        amount_in_cents: 38_200_000,
        currency: "COP",
        payment_method_type: "NEQUI",
      },
    },
    timestamp: 1_530_291_411,
    signature: {
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      checksum: "no-importa-para-estos-casos",
    },
    ...overrides,
  })
}

describe("integrityPayload", () => {
  it("concatena referencia, centavos, moneda y secreto en ese orden", () => {
    const payload = integrityPayload({
      reference: "NEXA-260903-K7F2QX",
      amountCents: Money.fromCOP(382_000),
      currency: "COP",
      integritySecret: INTEGRITY_SECRET,
    })

    expect(payload).toBe(`NEXA-260903-K7F2QX38200000COP${INTEGRITY_SECRET}`)
  })

  it("intercala el vencimiento antes del secreto cuando se envía", () => {
    const payload = integrityPayload({
      reference: "NEXA-260903-K7F2QX",
      amountCents: Money.fromCOP(382_000),
      currency: "COP",
      expiresAt: "2026-09-03T23:37:00.000Z",
      integritySecret: INTEGRITY_SECRET,
    })

    expect(payload).toBe(
      `NEXA-260903-K7F2QX38200000COP2026-09-03T23:37:00.000Z${INTEGRITY_SECRET}`,
    )
  })

  it("no deja hueco por un vencimiento ausente", () => {
    // Concatenar un vacío no debe cambiar la firma respecto a omitirlo.
    const sin = integrityPayload({
      reference: "R",
      amountCents: Money.fromCents(100),
      currency: "COP",
      integritySecret: "s",
    })
    const conUndefined = integrityPayload({
      reference: "R",
      amountCents: Money.fromCents(100),
      currency: "COP",
      expiresAt: undefined,
      integritySecret: "s",
    })

    expect(sin).toBe(conUndefined)
    expect(sin).toBe("R100COPs")
  })

  it("rechaza una referencia vacía o un secreto ausente", () => {
    const base = { amountCents: Money.fromCents(100), currency: "COP" } as const
    expect(() => integrityPayload({ ...base, reference: "", integritySecret: "s" })).toThrow(
      PaymentError,
    )
    expect(() => integrityPayload({ ...base, reference: "R", integritySecret: "" })).toThrow(
      PaymentError,
    )
  })
})

describe("eventChecksumPayload", () => {
  it("concatena los valores firmados, el timestamp y el secreto", () => {
    const payload = eventChecksumPayload(event(), EVENTS_SECRET)

    expect(payload).toBe(`01-1532941443-49201APPROVED382000001530291411${EVENTS_SECRET}`)
  })

  it("respeta el orden que declara el evento, no el del objeto", () => {
    const payload = eventChecksumPayload(
      event({
        signature: {
          properties: ["transaction.amount_in_cents", "transaction.id"],
          checksum: "x",
        },
      }),
      EVENTS_SECRET,
    )

    expect(payload).toBe(`3820000001-1532941443-492011530291411${EVENTS_SECRET}`)
  })

  it("trata una propiedad inexistente como vacía en vez de romper", () => {
    const payload = eventChecksumPayload(
      event({ signature: { properties: ["transaction.no_existe"], checksum: "x" } }),
      EVENTS_SECRET,
    )

    expect(payload).toBe(`1530291411${EVENTS_SECRET}`)
  })

  it("produce un checksum reproducible", () => {
    // Así es como lo verificará el adaptador: hash del payload y comparación.
    const checksum = sha256(eventChecksumPayload(event(), EVENTS_SECRET))
    expect(checksum).toHaveLength(64)
    expect(sha256(eventChecksumPayload(event(), EVENTS_SECRET))).toBe(checksum)
  })

  it("cambia si cambia el secreto", () => {
    expect(sha256(eventChecksumPayload(event(), EVENTS_SECRET))).not.toBe(
      sha256(eventChecksumPayload(event(), "otro_secreto")),
    )
  })

  it("cambia si se manipula un campo firmado", () => {
    const original = sha256(eventChecksumPayload(event(), EVENTS_SECRET))
    const manipulado = event()
    manipulado.data.transaction.amount_in_cents = 100

    expect(sha256(eventChecksumPayload(manipulado, EVENTS_SECRET))).not.toBe(original)
  })

  it("NO cambia si se manipula la referencia, que Wompi no firma", () => {
    // Este es el motivo de que exista assertPayable: la firma sola no basta
    // para dar por buena la orden a la que se aplica el pago.
    const original = sha256(eventChecksumPayload(event(), EVENTS_SECRET))
    const suplantado = event()
    suplantado.data.transaction.reference = "NEXA-260903-OTRAOR"

    expect(sha256(eventChecksumPayload(suplantado, EVENTS_SECRET))).toBe(original)
  })

  it("rechaza un secreto ausente", () => {
    expect(() => eventChecksumPayload(event(), "")).toThrow(PaymentError)
  })
})

describe("wompiEventSchema", () => {
  it("acepta campos nuevos sin romper", () => {
    const parsed = wompiEventSchema.safeParse({
      event: "transaction.updated",
      data: {
        transaction: {
          id: "t1",
          reference: "R",
          status: "APPROVED",
          amount_in_cents: 1000,
          currency: "COP",
          campo_que_wompi_anada_manana: true,
        },
      },
      timestamp: 1,
      signature: { properties: [], checksum: "c" },
    })

    expect(parsed.success).toBe(true)
  })

  it("rechaza un estado desconocido", () => {
    const parsed = wompiEventSchema.safeParse({
      event: "transaction.updated",
      data: {
        transaction: {
          id: "t1",
          reference: "R",
          status: "INVENTADO",
          amount_in_cents: 1000,
          currency: "COP",
        },
      },
      timestamp: 1,
      signature: { properties: [], checksum: "c" },
    })

    expect(parsed.success).toBe(false)
  })
})

describe("eventIdFor", () => {
  it("distingue dos eventos de la misma transacción", () => {
    const pendiente = event()
    pendiente.data.transaction.status = "PENDING"

    expect(eventIdFor(event().data.transaction)).not.toBe(
      eventIdFor(pendiente.data.transaction),
    )
  })

  it("es estable ante el reintento del mismo evento", () => {
    expect(eventIdFor(event().data.transaction)).toBe(eventIdFor(event().data.transaction))
  })
})

describe("orderStatusForTransaction", () => {
  it("mapea cada resultado de Wompi", () => {
    expect(orderStatusForTransaction("APPROVED")).toBe("PAID")
    expect(orderStatusForTransaction("DECLINED")).toBe("PAYMENT_FAILED")
    expect(orderStatusForTransaction("ERROR")).toBe("PAYMENT_FAILED")
    expect(orderStatusForTransaction("VOIDED")).toBe("CANCELLED")
  })

  it("no mueve la orden mientras el pago sigue en curso", () => {
    expect(orderStatusForTransaction("PENDING")).toBeNull()
  })
})

describe("assertPayable", () => {
  const expectedCents = Money.fromCOP(382_000)

  it("deja pasar el importe exacto en COP", () => {
    expect(() =>
      assertPayable({ expectedCents, actualCents: 38_200_000, currency: "COP" }),
    ).not.toThrow()
  })

  it("rechaza un importe distinto del total de la orden", () => {
    expect(() =>
      assertPayable({ expectedCents, actualCents: 100_000, currency: "COP" }),
    ).toThrow(PaymentError)
  })

  it("rechaza otra moneda", () => {
    expect(() =>
      assertPayable({ expectedCents, actualCents: 38_200_000, currency: "USD" }),
    ).toThrow(PaymentError)
  })
})
