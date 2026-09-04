import { createHash, timingSafeEqual } from "node:crypto"
import {
  Money,
  eventChecksumPayload,
  eventIdFor,
  integrityPayload,
  wompiEventSchema,
  wompiTransactionSchema,
  type Cents,
  type PaymentGateway,
  type PaymentIntent,
  type PaymentStatus,
} from "@nexa/core"

/**
 * Adaptador de Wompi — ADR-0003.
 *
 * El dominio arma las cadenas que se firman; aquí se hashean y se habla por
 * red. Es la única pieza del sistema que conoce las URLs y los secretos de
 * la pasarela.
 *
 * Los cuatro secretos viven solo en el servidor salvo la clave pública, que
 * es la única que puede llegar al navegador.
 */

export class WompiConfigError extends Error {
  constructor(missing: string) {
    super(`Falta la variable de entorno ${missing}`)
    this.name = "WompiConfigError"
  }
}

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex")

/** Comparación en tiempo constante sobre dos hexadecimales del mismo largo. */
function equalChecksums(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))
}

export interface WompiConfig {
  readonly apiUrl: string
  readonly publicKey: string
  readonly privateKey: string
  readonly integritySecret: string
  readonly eventsSecret: string
  readonly siteUrl: string
}

/**
 * Configuración desde el entorno. Devuelve null en vez de lanzar cuando no
 * está: F3 se despliega antes de tener las credenciales de producción, y la
 * tienda tiene que seguir navegable con el pago desactivado (RNF-03). Quien
 * la use decide qué hacer con esa ausencia.
 */
export function wompiConfig(): WompiConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY
  const privateKey = process.env.WOMPI_PRIVATE_KEY
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET

  if (!publicKey || !privateKey || !integritySecret || !eventsSecret) return null

  return {
    apiUrl: process.env.WOMPI_API_URL ?? "https://sandbox.wompi.co/v1",
    publicKey,
    privateKey,
    integritySecret,
    eventsSecret,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  }
}

export class WompiGateway implements PaymentGateway {
  constructor(private readonly config: WompiConfig) {}

  /**
   * Con Checkout Web no hay que crear nada en Wompi: basta con firmar la
   * referencia y el importe. El navegador recibe la clave pública y la
   * firma, jamás el secreto que la produjo.
   */
  createIntent(reference: string, amountCents: Cents): PaymentIntent {
    return {
      reference,
      amountCents,
      currency: "COP",
      signature: sha256(
        integrityPayload({
          reference,
          amountCents,
          currency: "COP",
          integritySecret: this.config.integritySecret,
        }),
      ),
      publicKey: this.config.publicKey,
      // La referencia va en la RUTA y no en la query: Wompi añade su propio
      // `?id=` al volver, y así no depende de cómo concatene los parámetros.
      redirectUrl: `${this.config.siteUrl}/checkout/resultado/${reference}`,
    }
  }

  /**
   * Valida el evento antes de que nada toque la base de datos (ADR-0003,
   * punto 2). Devuelve null ante cualquier duda —forma inesperada o checksum
   * que no cuadra— y quien llama responde 401 sin más detalle: decirle a
   * quien lo intenta en qué falló le ahorra trabajo.
   */
  verifyEvent(body: unknown): { transaction: PaymentStatus; eventId: string } | null {
    const parsed = wompiEventSchema.safeParse(body)
    if (!parsed.success) return null

    const event = parsed.data
    const expected = sha256(eventChecksumPayload(event, this.config.eventsSecret))
    if (!equalChecksums(expected, event.signature.checksum.toLowerCase())) return null

    return {
      transaction: toPaymentStatus(event.data.transaction),
      eventId: eventIdFor(event.data.transaction),
    }
  }

  /**
   * RF-15 · el estado real de una orden cuyo webhook nunca llegó. Se busca
   * por referencia y no por id de transacción, porque justamente en ese caso
   * el id es lo que no tenemos.
   */
  async fetchByReference(reference: string): Promise<PaymentStatus | null> {
    const url = `${this.config.apiUrl}/transactions?reference=${encodeURIComponent(reference)}`
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${this.config.privateKey}` },
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(`Wompi respondió ${response.status} al consultar ${reference}`)
    }

    const body: unknown = await response.json()
    const rows = (body as { data?: unknown }).data
    if (!Array.isArray(rows) || rows.length === 0) return null

    // Si hubo varios intentos sobre la misma referencia, manda el aprobado.
    const parsed = rows
      .map((row) => wompiTransactionSchema.safeParse(row))
      .flatMap((r) => (r.success ? [r.data] : []))
    const winner = parsed.find((t) => t.status === "APPROVED") ?? parsed.at(-1)

    return winner ? toPaymentStatus(winner) : null
  }
}

function toPaymentStatus(
  transaction: ReturnType<typeof wompiTransactionSchema.parse>,
): PaymentStatus {
  return {
    transactionId: transaction.id,
    reference: transaction.reference,
    status: transaction.status,
    amountCents: Money.fromCents(transaction.amount_in_cents),
    currency: transaction.currency,
    method: transaction.payment_method_type ?? null,
  }
}

/** Instancia compartida, o null si la pasarela no está configurada. */
export function wompiGateway(): WompiGateway | null {
  const config = wompiConfig()
  return config ? new WompiGateway(config) : null
}
