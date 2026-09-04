import { createHash } from "node:crypto"
import { Money, eventChecksumPayload, wompiEventSchema, type WompiEvent } from "@nexa/core"
import { describe, expect, it } from "vitest"
import { WompiGateway, type WompiConfig } from "./wompi"

const CONFIG: WompiConfig = {
  apiUrl: "https://sandbox.wompi.co/v1",
  publicKey: "pub_test_abc",
  privateKey: "prv_test_abc",
  integritySecret: "test_integrity_secret",
  eventsSecret: "test_events_secret",
  siteUrl: "https://nexa.example",
}

const gateway = new WompiGateway(CONFIG)
const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex")

/** Un evento de Wompi con el checksum bien calculado, como llegaría de verdad. */
function signedEvent(overrides: Record<string, unknown> = {}): unknown {
  const base = wompiEventSchema.parse({
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
      checksum: "pendiente",
    },
    ...overrides,
  }) as WompiEvent

  base.signature.checksum = sha256(eventChecksumPayload(base, CONFIG.eventsSecret))
  return base
}

describe("createIntent", () => {
  it("firma referencia, importe y moneda con el secreto de integridad", () => {
    const intent = gateway.createIntent("NEXA-260903-K7F2QX", Money.fromCOP(382_000))

    expect(intent.signature).toBe(
      sha256(`NEXA-260903-K7F2QX38200000COP${CONFIG.integritySecret}`),
    )
  })

  it("expone la clave pública y nunca la privada ni los secretos", () => {
    const intent = gateway.createIntent("NEXA-260903-K7F2QX", Money.fromCOP(382_000))
    const serializado = JSON.stringify(intent)

    expect(intent.publicKey).toBe("pub_test_abc")
    expect(serializado).not.toContain(CONFIG.privateKey)
    expect(serializado).not.toContain(CONFIG.integritySecret)
    expect(serializado).not.toContain(CONFIG.eventsSecret)
  })

  it("devuelve al cliente a la página de su propia orden", () => {
    const intent = gateway.createIntent("NEXA-260903-K7F2QX", Money.fromCOP(382_000))

    expect(intent.redirectUrl).toBe(
      "https://nexa.example/checkout/resultado/NEXA-260903-K7F2QX",
    )
  })

  it("cambia la firma si cambia el importe", () => {
    const a = gateway.createIntent("R", Money.fromCOP(100_000)).signature
    const b = gateway.createIntent("R", Money.fromCOP(100_001)).signature

    expect(a).not.toBe(b)
  })
})

describe("verifyEvent", () => {
  it("acepta un evento con checksum correcto", () => {
    const verified = gateway.verifyEvent(signedEvent())

    expect(verified).not.toBeNull()
    expect(verified?.transaction.reference).toBe("NEXA-260903-K7F2QX")
    expect(verified?.transaction.status).toBe("APPROVED")
    expect(verified?.transaction.amountCents).toBe(38_200_000)
    expect(verified?.eventId).toBe("01-1532941443-49201:APPROVED")
  })

  it("rechaza un checksum que no cuadra", () => {
    const event = signedEvent() as WompiEvent
    event.signature.checksum = sha256("cualquier otra cosa")

    expect(gateway.verifyEvent(event)).toBeNull()
  })

  it("rechaza un importe manipulado después de firmar", () => {
    const event = signedEvent() as WompiEvent
    event.data.transaction.amount_in_cents = 100

    expect(gateway.verifyEvent(event)).toBeNull()
  })

  it("rechaza un rechazo convertido en aprobación después de firmar", () => {
    const declinado = signedEvent({
      data: {
        transaction: {
          id: "01-1532941443-49201",
          reference: "NEXA-260903-K7F2QX",
          status: "DECLINED",
          amount_in_cents: 38_200_000,
          currency: "COP",
        },
      },
    }) as WompiEvent
    declinado.data.transaction.status = "APPROVED"

    expect(gateway.verifyEvent(declinado)).toBeNull()
  })

  it("rechaza un evento firmado con otro secreto", () => {
    // Alguien que conozca el formato pero no el secreto de eventos.
    const impostor = new WompiGateway({ ...CONFIG, eventsSecret: "secreto_del_atacante" })
    const event = wompiEventSchema.parse(signedEvent()) as WompiEvent
    event.signature.checksum = sha256(
      eventChecksumPayload(event, "secreto_del_atacante"),
    )

    expect(gateway.verifyEvent(event)).toBeNull()
    // Y para descartar que el evento esté mal formado: su propia pasarela sí lo acepta.
    expect(impostor.verifyEvent(event)).not.toBeNull()
  })

  it("rechaza un cuerpo con forma inesperada sin lanzar", () => {
    expect(gateway.verifyEvent(null)).toBeNull()
    expect(gateway.verifyEvent({})).toBeNull()
    expect(gateway.verifyEvent({ event: "x" })).toBeNull()
    expect(gateway.verifyEvent("no soy json")).toBeNull()
  })

  it("acepta el checksum en mayúsculas", () => {
    const event = signedEvent() as WompiEvent
    event.signature.checksum = event.signature.checksum.toUpperCase()

    expect(gateway.verifyEvent(event)).not.toBeNull()
  })

  it("PASA la verificación con la referencia cambiada — por eso no basta", () => {
    // Wompi no firma `reference`. Un evento legítimo se puede reapuntar a
    // otra orden y el checksum sigue cuadrando. Lo que lo detiene es la
    // comprobación de importe en applyPayment, no esta firma.
    const event = signedEvent() as WompiEvent
    event.data.transaction.reference = "NEXA-260903-OTRAOR"

    const verified = gateway.verifyEvent(event)
    expect(verified).not.toBeNull()
    expect(verified?.transaction.reference).toBe("NEXA-260903-OTRAOR")
  })
})

