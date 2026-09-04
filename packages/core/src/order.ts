// ─────────────────────────────────────────────────────────────────────────
//  Órdenes — máquina de estados y referencia (RF-08, RF-09)
//
//  ports.ts declara el enum `OrderStatus` y deja anotado que "las
//  transiciones válidas se definen en F2". Esto es F2.
//
//  Todo lo de este archivo es puro: el reloj y la entropía entran como
//  parámetros. Así el test es determinista y el dominio sigue sin conocer
//  ni a Node ni al framework (constitución, principio 2).
// ─────────────────────────────────────────────────────────────────────────

import type { OrderStatus } from "./ports"

export class OrderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrderError"
  }
}

// ──────────────────────────────────────────────────  MÁQUINA DE ESTADOS ──

/**
 * Qué puede seguir a qué. Lo que no aparece aquí no ocurre: el adaptador
 * llama a `assertTransition` dentro de la misma transacción que escribe el
 * estado, de modo que una orden no pueda saltar de DRAFT a PAID sin haber
 * reservado stock por el camino.
 */
const TRANSITIONS = {
  DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["PAID", "PAYMENT_FAILED", "EXPIRED", "CANCELLED"],
  PAID: ["PREPARING", "CANCELLED", "REFUNDED"],
  PREPARING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  PAYMENT_FAILED: ["PENDING_PAYMENT", "CANCELLED"],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
} as const satisfies Record<OrderStatus, readonly OrderStatus[]>

/** Estados a los que se puede ir desde `status`. Vacío si es terminal. */
export function nextStatuses(status: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[status]
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (TRANSITIONS[from] as readonly OrderStatus[]).includes(to)
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new OrderError(`Transición inválida de ${from} a ${to}`)
  }
}

/** Una orden terminal ya no se mueve: ni un webhook tardío la reabre. */
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0
}

/**
 * RF-08 · MIENTRAS una orden esté en PENDING_PAYMENT, EL SISTEMA mantiene el
 * stock reservado y no disponible para otros clientes.
 *
 * DRAFT no reserva: llenar el carrito no puede agotarle el producto a nadie,
 * o bastaría con dejar carritos abiertos para vaciar la tienda.
 */
export function holdsStock(status: OrderStatus): boolean {
  return status === "PENDING_PAYMENT"
}

// ───────────────────────────────────────────────────────────────  RESERVA ──

/** RF-09 · el plazo que tiene una orden para pagarse antes de expirar. */
export const RESERVATION_TTL_MINUTES = 30

export function reservationExpiresAt(
  from: Date,
  ttlMinutes: number = RESERVATION_TTL_MINUTES,
): Date {
  if (Number.isNaN(from.getTime())) {
    throw new OrderError("La fecha de inicio de la reserva no es válida")
  }
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    throw new OrderError(`El plazo debe ser un número positivo, se recibió ${ttlMinutes}`)
  }
  return new Date(from.getTime() + ttlMinutes * 60_000)
}

/** Se compara con `>=`: al minuto 30 exacto la reserva ya está vencida. */
export function isReservationExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime()
}

// ────────────────────────────────────────────────────  NÚMERO DE ORDEN ──

/**
 * Alfabeto de Crockford: sin I, L, O ni U, para que nadie confunda un 1 con
 * una I al dictar el número de orden por teléfono o por WhatsApp (RF-16).
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const SUFFIX_LENGTH = 6

/** Bytes de entropía que `buildOrderNumber` espera recibir. */
export const ORDER_NUMBER_ENTROPY_BYTES = SUFFIX_LENGTH

const bogotaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
})

/**
 * `NEXA-260903-K7F2QX`. La fecha va en hora de Bogotá y no en UTC: un pedido
 * hecho a las ocho de la noche no puede llevar impresa la fecha del día
 * siguiente cuando el cliente lo lea.
 *
 * La entropía entra como parámetro —la genera el adaptador con `crypto`—
 * para que este archivo siga siendo puro y el test, determinista.
 */
export function buildOrderNumber(now: Date, entropy: Uint8Array): string {
  if (Number.isNaN(now.getTime())) {
    throw new OrderError("La fecha de la orden no es válida")
  }
  if (entropy.length < SUFFIX_LENGTH) {
    throw new OrderError(
      `Se requieren ${SUFFIX_LENGTH} bytes de entropía, se recibieron ${entropy.length}`,
    )
  }

  const parts = bogotaDate.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? ""
  const stamp = `${part("year")}${part("month")}${part("day")}`

  let suffix = ""
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += ALPHABET[entropy[i]! % ALPHABET.length]
  }

  return `NEXA-${stamp}-${suffix}`
}
