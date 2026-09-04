// ─────────────────────────────────────────────────────────────────────────
//  Adaptador Prisma del puerto InventoryService — ADR-0004
//
//  El inventario es un libro append-only, no un contador. Cada cambio
//  inserta una fila en `inventory_movements`; `product_variants.stock` es
//  solo el caché de SUM(delta) para poder leer rápido en el catálogo.
//
//  Convención de signos, que es lo que hay que tener en la cabeza para leer
//  el resto del archivo:
//
//    RESTOCK              +n   entra mercancía
//    RESERVATION          −n   se aparta para una orden, con expires_at
//    RESERVATION_RELEASE  +n   vuelve a la venta
//    SALE                 −n   sale de verdad
//    RETURN               +n   el cliente devolvió
//    ADJUSTMENT           ±n   conteo físico
//
//  Al confirmarse un pago se escriben RESERVATION_RELEASE y SALE juntos: el
//  neto sobre el stock es cero, pero el libro pasa de decir "apartado" a
//  decir "vendido". Esa es la razón de que `commitSale` no toque el caché.
//
//  IMPORTANTE: `reserve`, `commitSale` y `releaseReservation` tienen que
//  llamarse dentro de una transacción —construyendo el servicio con el
//  cliente transaccional— o el `FOR UPDATE` de `reserve` suelta el bloqueo
//  en cuanto termina la consulta y dos compras del último bote se pisan.
// ─────────────────────────────────────────────────────────────────────────

import {
  reservationExpiresAt,
  type Id,
  type InventoryReason,
  type InventoryService,
} from "@nexa/core"
import type { Prisma, PrismaClient } from "../../generated/client/index.js"

/** Cliente normal o transaccional: los métodos sirven igual con ambos. */
export type PrismaLike = PrismaClient | Prisma.TransactionClient

export class InventoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InventoryError"
  }
}

export class InsufficientStockError extends InventoryError {
  constructor(
    readonly variantId: Id,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Stock insuficiente: se pidieron ${requested} y quedan ${available}`)
    this.name = "InsufficientStockError"
  }
}

export class PrismaInventoryService implements InventoryService {
  constructor(private readonly db: PrismaLike) {}

  /**
   * Lo que puede comprar el próximo cliente. Es el caché, que ya viene con
   * las reservas vigentes descontadas: no hay que restarlas otra vez.
   */
  async availableStock(variantId: Id): Promise<number> {
    const variant = await this.db.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true },
    })
    return variant?.stock ?? 0
  }

  /**
   * Aparta unidades para una orden. El `SELECT … FOR UPDATE` serializa a dos
   * clientes que van por la última unidad: el segundo espera al primero y
   * entonces sí ve el stock ya descontado, en vez de leer el mismo número
   * que él y vender dos veces lo mismo.
   */
  async reserve(
    variantId: Id,
    quantity: number,
    orderId: Id,
    ttlMinutes: number,
  ): Promise<void> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InventoryError(`La cantidad a reservar debe ser positiva, se recibió ${quantity}`)
    }

    const locked = await this.db.$queryRaw<{ stock: number }[]>`
      SELECT stock FROM product_variants WHERE id = ${variantId} FOR UPDATE
    `
    const available = locked[0]?.stock
    if (available === undefined) {
      throw new InventoryError(`La variante ${variantId} no existe`)
    }
    if (available < quantity) {
      throw new InsufficientStockError(variantId, quantity, available)
    }

    await this.db.inventoryMovement.create({
      data: {
        variantId,
        delta: -quantity,
        reason: "RESERVATION",
        orderId,
        expiresAt: reservationExpiresAt(new Date(), ttlMinutes),
      },
    })
    await this.db.productVariant.update({
      where: { id: variantId },
      data: { stock: { decrement: quantity } },
    })
  }

  /**
   * Devuelve a la venta lo que la orden tenga apartado. Idempotente por
   * construcción: si ya se liberó, el neto por variante es cero y no hay
   * nada que hacer. Eso importa porque el job de expiración y un webhook
   * tardío pueden llamarlo a la vez.
   */
  async releaseReservation(orderId: Id): Promise<void> {
    const outstanding = await this.outstandingReservations(orderId)

    for (const [variantId, quantity] of outstanding) {
      await this.db.inventoryMovement.create({
        data: { variantId, delta: quantity, reason: "RESERVATION_RELEASE", orderId },
      })
      await this.db.productVariant.update({
        where: { id: variantId },
        data: { stock: { increment: quantity } },
      })
    }
  }

  /**
   * Convierte la reserva en venta. No mueve el caché de stock —la unidad ya
   * salió al reservarse— pero deja el libro diciendo la verdad.
   *
   * Si la orden ya tiene un SALE, no hace nada: es la idempotencia que
   * necesita RF-13 cuando Wompi reintenta el mismo evento.
   */
  async commitSale(orderId: Id): Promise<void> {
    const alreadySold = await this.db.inventoryMovement.findFirst({
      where: { orderId, reason: "SALE" },
      select: { id: true },
    })
    if (alreadySold) return

    const outstanding = await this.outstandingReservations(orderId)
    if (outstanding.size === 0) {
      throw new InventoryError(
        `La orden ${orderId} no tiene reserva vigente que convertir en venta`,
      )
    }

    for (const [variantId, quantity] of outstanding) {
      await this.db.inventoryMovement.createMany({
        data: [
          { variantId, delta: quantity, reason: "RESERVATION_RELEASE", orderId },
          { variantId, delta: -quantity, reason: "SALE", orderId },
        ],
      })
    }
  }

  /**
   * Devuelve al inventario lo ya vendido de una orden: cancelarla o
   * reembolsarla después de cobrada. Idempotente igual que la liberación.
   */
  async restockSold(orderId: Id): Promise<void> {
    const rows = await this.db.inventoryMovement.groupBy({
      by: ["variantId"],
      where: { orderId, reason: { in: ["SALE", "RETURN"] } },
      _sum: { delta: true },
    })

    for (const row of rows) {
      const outstanding = -(row._sum.delta ?? 0)
      if (outstanding <= 0) continue

      await this.db.inventoryMovement.create({
        data: { variantId: row.variantId, delta: outstanding, reason: "RETURN", orderId },
      })
      await this.db.productVariant.update({
        where: { id: row.variantId },
        data: { stock: { increment: outstanding } },
      })
    }
  }

  /** Movimiento suelto sin orden detrás: reposición o conteo físico. */
  async record(
    variantId: Id,
    delta: number,
    reason: InventoryReason,
    note?: string,
  ): Promise<void> {
    if (!Number.isInteger(delta)) {
      throw new InventoryError(`El movimiento debe ser un entero, se recibió ${delta}`)
    }
    await this.db.inventoryMovement.create({
      data: { variantId, delta, reason, note: note ?? null },
    })
    await this.db.productVariant.update({
      where: { id: variantId },
      data: { stock: { increment: delta } },
    })
  }

  /**
   * Comprobación de consistencia que pide ADR-0004: compara el caché con la
   * suma real del libro. Devuelve solo las variantes que no cuadran.
   */
  async findDrift(): Promise<readonly { variantId: Id; cached: number; actual: number }[]> {
    const rows = await this.db.$queryRaw<
      { variant_id: string; cached: number; actual: number }[]
    >`
      SELECT v.id AS variant_id,
             v.stock AS cached,
             COALESCE(SUM(m.delta), 0)::int AS actual
        FROM product_variants v
        LEFT JOIN inventory_movements m ON m.variant_id = v.id
       GROUP BY v.id, v.stock
      HAVING v.stock <> COALESCE(SUM(m.delta), 0)
    `
    return rows.map((r) => ({ variantId: r.variant_id, cached: r.cached, actual: r.actual }))
  }

  /**
   * Cuánto sigue apartado por orden y variante. Se calcula sumando reservas
   * y liberaciones en lugar de marcar filas como usadas, para no romper la
   * regla de que el libro es solo de inserciones.
   */
  private async outstandingReservations(orderId: Id): Promise<Map<string, number>> {
    const rows = await this.db.inventoryMovement.groupBy({
      by: ["variantId"],
      where: { orderId, reason: { in: ["RESERVATION", "RESERVATION_RELEASE"] } },
      _sum: { delta: true },
    })

    const outstanding = new Map<string, number>()
    for (const row of rows) {
      const net = row._sum.delta ?? 0
      if (net < 0) outstanding.set(row.variantId, -net)
    }
    return outstanding
  }
}
