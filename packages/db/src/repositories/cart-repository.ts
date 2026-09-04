// ─────────────────────────────────────────────────────────────────────────
//  Adaptador Prisma del puerto CartRepository
//
//  El carrito es la orden DRAFT de una sesión (ADS §6.3: no hay tabla
//  `carts`). Una sesión tiene como mucho una, garantizado por un índice
//  único parcial sobre `orders (session_id) WHERE status = 'DRAFT'`.
//
//  Sobre los precios: `order_items` guarda snapshots de nombre y precio,
//  pero MIENTRAS la orden está en DRAFT esos snapshots no mandan. Lo que se
//  le muestra al cliente y lo que se suma sale siempre de la variante viva
//  (constitución, principio 3). Los snapshots se congelan de verdad en el
//  checkout, que es el momento en que el precio deja de poder moverse.
//
//  Toda operación va acotada por `sessionId`: sin eso, cambiar la cookie
//  bastaría para editar el carrito de otro.
// ─────────────────────────────────────────────────────────────────────────

import {
  Money,
  ORDER_NUMBER_ENTROPY_BYTES,
  buildCart,
  buildOrderNumber,
  resolveQuantity,
  type Cart,
  type CartLineDraft,
  type CartMutation,
  type CartRepository,
  type Id,
  type ShippingPolicy,
} from "@nexa/core"
import { randomBytes } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/client/index.js"

export class CartNotFoundError extends Error {
  constructor(message = "No hay carrito para esta sesión") {
    super(message)
    this.name = "CartNotFoundError"
  }
}

const cartInclude = {
  items: {
    // cuid v1 es monótono, así que el id conserva el orden en que se añadió.
    orderBy: { id: "asc" },
    include: {
      variant: {
        include: {
          product: {
            include: {
              images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.OrderInclude

type CartRow = Prisma.OrderGetPayload<{ include: typeof cartInclude }>

/** Prisma no tipa los códigos de error; este es el de violación de unicidad. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
}

export function newOrderNumber(): string {
  return buildOrderNumber(new Date(), randomBytes(ORDER_NUMBER_ENTROPY_BYTES))
}

export class PrismaCartRepository implements CartRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly shipping: ShippingPolicy,
  ) {}

  async find(sessionId: Id): Promise<Cart | null> {
    const row = await this.db.order.findUnique({
      where: { draftSessionId: sessionId },
      include: cartInclude,
    })
    return row ? this.toCart(row) : null
  }

  async findOrCreate(sessionId: Id): Promise<Cart> {
    const existing = await this.find(sessionId)
    if (existing) return existing

    // Dos peticiones simultáneas de la misma sesión —un doble clic en
    // "añadir"— chocan contra el índice único parcial. La perdedora relee
    // en vez de fallar: el cliente no tiene por qué enterarse.
    try {
      const row = await this.db.order.create({
        data: {
          orderNumber: newOrderNumber(),
          sessionId,
          draftSessionId: sessionId,
          status: "DRAFT",
          channel: "WEB",
        },
        include: cartInclude,
      })
      return this.toCart(row)
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const raced = await this.find(sessionId)
      if (!raced) throw error
      return raced
    }
  }

  /** Acumula sobre lo que ya hubiera de esa variante en el carrito. */
  async addItem(sessionId: Id, variantId: Id, quantity: number): Promise<CartMutation> {
    const cart = await this.findOrCreate(sessionId)

    return this.db.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, isActive: true, product: { isActive: true } },
        include: { product: { select: { name: true } } },
      })
      if (!variant) {
        throw new CartNotFoundError(`La variante ${variantId} no está disponible`)
      }

      const current = await tx.orderItem.findFirst({
        where: { orderId: cart.id, variantId },
        select: { id: true, quantity: true },
      })

      const resolution = resolveQuantity((current?.quantity ?? 0) + quantity, variant.stock)
      await this.writeLine(tx, cart.id, variant, current?.id ?? null, resolution.quantity)

      return this.mutationFor(tx, cart.id, resolution.capped, resolution.available)
    })
  }

  /** Fija la cantidad exacta. Cero equivale a quitar la línea. */
  async setItemQuantity(sessionId: Id, itemId: Id, quantity: number): Promise<CartMutation> {
    return this.db.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: itemId, order: { draftSessionId: sessionId } },
        include: {
          order: { select: { id: true } },
          variant: { include: { product: { select: { name: true } } } },
        },
      })
      if (!item) throw new CartNotFoundError("Ese ítem no está en tu carrito")

      const resolution = resolveQuantity(quantity, item.variant.stock)
      await this.writeLine(tx, item.order.id, item.variant, item.id, resolution.quantity)

      return this.mutationFor(tx, item.order.id, resolution.capped, resolution.available)
    })
  }

  async removeItem(sessionId: Id, itemId: Id): Promise<Cart> {
    const deleted = await this.db.orderItem.deleteMany({
      where: { id: itemId, order: { draftSessionId: sessionId } },
    })
    if (deleted.count === 0) throw new CartNotFoundError("Ese ítem no está en tu carrito")

    const cart = await this.find(sessionId)
    if (!cart) throw new CartNotFoundError()
    return cart
  }

  /** Inserta, actualiza o borra la línea según la cantidad ya resuelta. */
  private async writeLine(
    tx: Prisma.TransactionClient,
    orderId: Id,
    variant: { id: string; name: string; priceCents: number; product: { name: string } },
    itemId: Id | null,
    quantity: number,
  ): Promise<void> {
    if (quantity <= 0) {
      if (itemId) await tx.orderItem.delete({ where: { id: itemId } })
      return
    }

    const snapshot = {
      productNameSnapshot: variant.product.name,
      variantNameSnapshot: variant.name,
      unitPriceCents: variant.priceCents,
      lineTotalCents: variant.priceCents * quantity,
      quantity,
    }

    if (itemId) {
      await tx.orderItem.update({ where: { id: itemId }, data: snapshot })
      return
    }
    await tx.orderItem.create({ data: { orderId, variantId: variant.id, ...snapshot } })
  }

  private async mutationFor(
    tx: Prisma.TransactionClient,
    orderId: Id,
    capped: boolean,
    available: number,
  ): Promise<CartMutation> {
    const row = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: cartInclude,
    })
    return { cart: this.toCart(row), capped, available }
  }

  private toCart(row: CartRow): Cart {
    const lines: CartLineDraft[] = row.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productSlug: item.variant.product.slug,
      productName: item.variant.product.name,
      variantName: item.variant.name,
      imageUrl: item.variant.product.images[0]?.url ?? null,
      // Precio vivo, no el snapshot: si subió, el cliente lo ve antes de pagar.
      unitPriceCents: Money.fromCents(item.variant.priceCents),
      quantity: item.quantity,
      availableStock: item.variant.stock,
    }))

    return buildCart({
      id: row.id,
      orderNumber: row.orderNumber,
      lines,
      shipping: this.shipping,
    })
  }
}
