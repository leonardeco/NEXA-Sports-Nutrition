// ─────────────────────────────────────────────────────────────────────────
//  Carrito — dominio puro (RF-05, RF-06, RF-10)
//
//  No existe tabla `carts`: el carrito es una orden en estado DRAFT, tal
//  como quedó el modelo en el ADS §6.3. Este archivo no lo sabe ni le hace
//  falta. Recibe líneas ya leídas del catálogo y devuelve cantidades
//  resueltas y totales; quien las persiste es packages/db.
//
//  Constitución, principio 3: el precio y el stock que entran aquí salen
//  siempre de la base de datos. Ningún importe enviado por el cliente llega
//  hasta este punto — se descarta antes, al validar el borde con Zod.
// ─────────────────────────────────────────────────────────────────────────

import { Money, type Cents } from "./money"
import type { Id, Slug } from "./ports"

export class CartError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CartError"
  }
}

// ─────────────────────────────────────────────────────────────────  ENVÍO ──

/**
 * Tarifa plana nacional. El importe concreto es configuración de servidor y
 * se inyecta: no se escribe aquí para no tener que tocar el dominio —ni sus
 * tests— cada vez que el transportador cambie su tarifa.
 */
export interface ShippingPolicy {
  readonly flatRateCents: Cents
}

/** Un carrito vacío no paga envío; cualquier otro paga la tarifa plana. */
export function shippingFor(itemCount: number, policy: ShippingPolicy): Cents {
  return itemCount <= 0 ? Money.zero() : policy.flatRateCents
}

// ──────────────────────────────────────────────────────────────  CANTIDAD ──

export interface QuantityResolution {
  /** Lo que realmente se guarda: nunca por encima del stock disponible. */
  readonly quantity: number
  /** true si hubo recorte, que es lo que se le informa al cliente. */
  readonly capped: boolean
  readonly available: number
}

/**
 * RF-06 · SI la cantidad solicitada supera el stock disponible, ENTONCES EL
 * SISTEMA la limita al stock disponible e informa al cliente.
 *
 * No lanza cuando no queda stock: devuelve 0 con `capped: true`, porque
 * "agotado" es una respuesta corriente del catálogo y no un error de
 * programa. Sí lanza si la entrada no es un entero — eso sí es un fallo.
 */
export function resolveQuantity(requested: number, available: number): QuantityResolution {
  if (!Number.isInteger(requested) || requested < 0) {
    throw new CartError(`La cantidad debe ser un entero no negativo, se recibió ${requested}`)
  }
  if (!Number.isInteger(available)) {
    throw new CartError(`El stock disponible debe ser un entero, se recibió ${available}`)
  }
  const ceiling = Math.max(available, 0)
  const quantity = Math.min(requested, ceiling)
  return { quantity, capped: quantity < requested, available: ceiling }
}

// ────────────────────────────────────────────────────────────────  LÍNEAS ──

/** Una línea del carrito con los datos de catálogo ya resueltos. */
export interface CartLine {
  /** Id de la fila `order_items`. */
  readonly id: Id
  readonly variantId: Id
  readonly productSlug: Slug
  readonly productName: string
  readonly variantName: string
  readonly imageUrl: string | null
  /** Precio vivo de la variante, releído en cada lectura del carrito. */
  readonly unitPriceCents: Cents
  readonly quantity: number
  readonly lineTotalCents: Cents
  /** Stock de ahora mismo, para marcar la línea si el catálogo se movió. */
  readonly availableStock: number
}

/** Lo que el adaptador tiene antes de calcular: la línea menos su total. */
export type CartLineDraft = Omit<CartLine, "lineTotalCents">

export function toCartLine(draft: CartLineDraft): CartLine {
  return { ...draft, lineTotalCents: Money.multiply(draft.unitPriceCents, draft.quantity) }
}

// ───────────────────────────────────────────────────────────────  CARRITO ──

export interface Cart {
  readonly id: Id
  readonly orderNumber: string
  readonly lines: readonly CartLine[]
  readonly subtotalCents: Cents
  readonly shippingCents: Cents
  readonly discountCents: Cents
  readonly totalCents: Cents
  /** Suma de cantidades — el número que muestra la insignia del header. */
  readonly itemCount: number
  /** true si alguna línea quedó por encima del stock actual. */
  readonly hasStockIssues: boolean
}

export interface BuildCartInput {
  readonly id: Id
  readonly orderNumber: string
  readonly lines: readonly CartLineDraft[]
  readonly shipping: ShippingPolicy
  readonly discountCents?: Cents
}

/**
 * Recalcula el carrito entero desde cero (RF-10). Se llama en cada lectura,
 * no solo en el checkout: si el precio de una variante subió mientras el
 * carrito estaba abierto, el cliente ve el precio nuevo antes de pagarlo.
 */
export function buildCart(input: BuildCartInput): Cart {
  const lines = input.lines.map(toCartLine)
  const subtotalCents = Money.sum(lines.map((line) => line.lineTotalCents))
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0)
  const shippingCents = shippingFor(itemCount, input.shipping)

  // El descuento nunca deja el subtotal en negativo ni se come el envío.
  const discountCents = Money.fromCents(
    Math.min(Math.max(input.discountCents ?? 0, 0), subtotalCents),
  )
  const totalCents = Money.subtract(Money.add(subtotalCents, shippingCents), discountCents)

  return {
    id: input.id,
    orderNumber: input.orderNumber,
    lines,
    subtotalCents,
    shippingCents,
    discountCents,
    totalCents,
    itemCount,
    hasStockIssues: lines.some((line) => line.quantity > line.availableStock),
  }
}
