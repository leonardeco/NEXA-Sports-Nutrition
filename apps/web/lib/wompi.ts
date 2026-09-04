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
   * RF-15 · el estado real de una transacción, preguntándoselo a Wompi.
   *
   * `GET /v1/transactions/{id}` es el único endpoint de consulta que la
   * documentación garantiza. Buscar por `reference` parece existir, pero no
   * está documentado para recaudo, y la reconciliación es justo lo que no
   * puede depender de un endpoint no documentado: si Wompi lo cambia, se
   * rompe en silencio el mecanismo que evita cobrar sin entregar.
   *
   * El id lo conocemos por dos vías: el webhook, y el `?id=` que Wompi añade
   * al redirect. Que venga del navegador no lo vuelve peligroso — no es un
   * estado, es un identificador, y el estado se lo preguntamos nosotros a
   * Wompi con nuestras credenciales.
   *
   * La consulta va con la clave pública, que es lo que la documentación
   * indica para verificar el estado de una transacción.
   */
  async fetchById(transactionId: string): Promise<PaymentStatus | null> {
    const url = `${this.config.apiUrl}/transactions/${encodeURIComponent(transactionId)}`
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${this.config.publicKey}` },
      cache: "no-store",
    })

    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Wompi respondió ${response.status} al consultar ${transactionId}`)
    }

    const body: unknown = await response.json()
    const parsed = wompiTransactionSchema.safeParse((body as { data?: unknown }).data)
    return parsed.success ? toPaymentStatus(parsed.data) : null
  }

  /**
   * Reconciliador para `expireStale`: prueba los ids de transacción que ya
   * conocemos de esa orden y se queda con el primero que resuelva algo.
   *
   * Sin ningún id conocido no hay nada que preguntar: significa que el
   * cliente nunca llegó a generar una transacción de la que nos enteráramos,
   * y la orden se expira con normalidad.
   */
  async reconcile(order: {
    orderNumber: string
    transactionIds: readonly string[]
  }): Promise<PaymentStatus | null> {
    for (const id of order.transactionIds) {
      const status = await this.fetchById(id)
      if (status && status.status !== "PENDING") return status
    }
    return null
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
