// ─────────────────────────────────────────────────────────────────────────
//  Pagos — ADR-0003
//
//  Este archivo NO calcula hashes. Arma las cadenas que hay que pasar por
//  SHA-256 y deja el hash al adaptador. No es purismo: `packages/core` lo
//  importa también el navegador —el formulario de checkout usa sus esquemas
//  Zod— y un `import "node:crypto"` en el dominio rompería el bundle.
//
//  Lo que sí vive aquí es lo que de verdad se puede equivocar y conviene
//  tener bajo test: el ORDEN EXACTO de la concatenación que se firma. Un
//  campo fuera de sitio no falla ruidosamente, falla con un "firma
//  inválida" que parece un problema de credenciales.
// ─────────────────────────────────────────────────────────────────────────

import type { Cents } from "./money"
import type { OrderStatus } from "./ports"
import { z } from "zod"

export class PaymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PaymentError"
  }
}

// ─────────────────────────────────────────────  FIRMA DE INTEGRIDAD (ida) ──

export interface IntegrityInput {
  readonly reference: string
  readonly amountCents: Cents
  readonly currency: "COP"
  readonly integritySecret: string
  /** ISO-8601. Si se manda a Wompi, entra en la firma; si no, se omite. */
  readonly expiresAt?: string | undefined
}

/**
 * `referencia + centavos + moneda [+ vencimiento] + secreto`, en ese orden.
 *
 * Wompi rechaza la transacción si no cuadra, sin decir por qué. El
 * vencimiento solo se concatena cuando se envía: incluirlo vacío produce una
 * firma distinta de la que Wompi calcula.
 */
export function integrityPayload(input: IntegrityInput): string {
  if (!input.reference) throw new PaymentError("La referencia no puede estar vacía")
  if (!input.integritySecret) throw new PaymentError("Falta el secreto de integridad")

  const expiry = input.expiresAt ?? ""
  return `${input.reference}${input.amountCents}${input.currency}${expiry}${input.integritySecret}`
}

// ────────────────────────────────────────────────  EVENTO DE WEBHOOK (vuelta) ──

export const wompiTransactionStatusSchema = z.enum([
  "APPROVED",
  "DECLINED",
  "VOIDED",
  "ERROR",
  "PENDING",
])

export type WompiTransactionStatus = z.infer<typeof wompiTransactionStatusSchema>

/**
 * Solo se declaran los campos de los que dependemos. Wompi manda bastante
 * más y `passthrough` deja que crezca sin romper el webhook, que es lo
 * último que uno quiere que se caiga por un campo nuevo.
 */
export const wompiTransactionSchema = z
  .object({
    id: z.string().min(1),
    reference: z.string().min(1),
    status: wompiTransactionStatusSchema,
    amount_in_cents: z.number().int(),
    currency: z.string().min(1),
    payment_method_type: z.string().nullish(),
  })
  .passthrough()

export const wompiEventSchema = z
  .object({
    event: z.string().min(1),
    data: z.object({ transaction: wompiTransactionSchema }).passthrough(),
    timestamp: z.number().int(),
    signature: z.object({
      properties: z.array(z.string()).max(20),
      checksum: z.string().min(1),
    }),
  })
  .passthrough()

export type WompiEvent = z.infer<typeof wompiEventSchema>
export type WompiTransaction = z.infer<typeof wompiTransactionSchema>

/** Lee `transaction.id` sobre el objeto `data`. Ausente cuenta como vacío. */
function valueAt(root: unknown, path: string): string {
  let current: unknown = root
  for (const key of path.split(".")) {
    if (typeof current !== "object" || current === null) return ""
    current = (current as Record<string, unknown>)[key]
  }
  return current === null || current === undefined ? "" : String(current)
}

/**
 * `valores_de_las_propiedades_firmadas + timestamp + secreto_de_eventos`.
 *
 * Wompi dice en el propio evento qué propiedades firmó. Que esa lista venga
 * del cuerpo —que es lo que se está validando— no la vuelve peligrosa: sin
 * el secreto no se puede producir un checksum que cuadre, se manipule la
 * lista como se manipule.
 *
 * Lo que SÍ es peligroso, y por eso va escrito aquí: la firma de Wompi NO
 * cubre `reference`. Quien haya hecho un pago legítimo de mil pesos podría
 * reenviar su evento firmado cambiando la referencia por la de otra orden.
 * Por eso quien aplique el pago tiene que comprobar además que el importe
 * coincide con el total de la orden — ver `assertPayable`.
 */
export function eventChecksumPayload(event: WompiEvent, eventsSecret: string): string {
  if (!eventsSecret) throw new PaymentError("Falta el secreto de eventos")

  const signed = event.signature.properties.map((path) => valueAt(event.data, path)).join("")
  return `${signed}${event.timestamp}${eventsSecret}`
}

/**
 * Identificador de deduplicación (RF-13). Va la transacción Y su estado: una
 * misma transacción genera varios eventos según avanza, y quedarse solo con
 * el id descartaría el APPROVED por haber visto antes el PENDING.
 */
export function eventIdFor(transaction: WompiTransaction): string {
  return `${transaction.id}:${transaction.status}`
}

// ────────────────────────────────────────────────────────────  RESOLUCIÓN ──

/**
 * A qué estado lleva la orden cada resultado de Wompi. `PENDING` devuelve
 * null: el pago sigue en curso y la orden no se mueve.
 */
export function orderStatusForTransaction(status: WompiTransactionStatus): OrderStatus | null {
  switch (status) {
    case "APPROVED":
      return "PAID"
    case "DECLINED":
    case "ERROR":
      return "PAYMENT_FAILED"
    case "VOIDED":
      return "CANCELLED"
    case "PENDING":
      return null
  }
}

export interface PayableCheck {
  readonly expectedCents: Cents
  readonly actualCents: number
  readonly currency: string
}

/**
 * La comprobación que cierra el agujero descrito arriba: el importe y la
 * moneda que dice el evento tienen que ser los de la orden. Si no cuadran,
 * el evento no se aplica aunque su firma sea válida.
 */
export function assertPayable(check: PayableCheck): void {
  if (check.currency !== "COP") {
    throw new PaymentError(`Moneda inesperada ${check.currency}, se esperaba COP`)
  }
  if (check.actualCents !== check.expectedCents) {
    throw new PaymentError(
      `El importe pagado (${check.actualCents}) no coincide con el de la orden (${check.expectedCents})`,
    )
  }
}
