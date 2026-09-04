// ─────────────────────────────────────────────────────────────────────────
//  Adaptador Prisma del puerto OrderRepository — RF-08, RF-09, RF-10, RF-23
//
//  Aquí vive la frontera transaccional del sistema. RNF-05 dice que ninguna
//  orden puede quedar pagada sin stock descontado ni al revés, y la forma de
//  cumplirlo es que el cambio de estado y el movimiento de inventario se
//  escriban en la misma transacción, nunca en dos pasos.
//
//  A diferencia del carrito, una orden ya creada se lee por sus snapshots:
//  el precio se congeló en el checkout y no puede moverse después, aunque el
//  catálogo cambie mañana.
// ─────────────────────────────────────────────────────────────────────────

import {
  Money,
  RESERVATION_TTL_MINUTES,
  assertPayable,
  assertTransition,
  orderStatusForTransaction,
  shippingFor,
  type CheckoutInput,
  type ExpiryReport,
  type Id,
  type PaymentReconciler,
  type OrderDetail,
  type OrderLine,
  type OrderPage,
  type OrderQuery,
  type OrderRepository,
  type OrderStatus,
  type OrderSummary,
  type PaymentStatus,
  type ShippingPolicy,
} from "@nexa/core"
import type { Prisma, PrismaClient } from "../../generated/client/index.js"
import { PrismaInventoryService } from "./inventory-service"

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CheckoutError"
  }
}

export class OrderNotFoundError extends Error {
  constructor(reference: string) {
    super(`No existe la orden ${reference}`)
    this.name = "OrderNotFoundError"
  }
}

const detailInclude = {
  customer: true,
  items: {
    orderBy: { id: "asc" },
    include: { variant: { include: { product: { select: { slug: true } } } } },
  },
  // La reserva más reciente marca cuándo expira la orden (RF-09).
  movements: {
    where: { reason: "RESERVATION" as const },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.OrderInclude

type OrderRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>

/**
 * Prisma distingue "no tocar la columna" de "poner null" en un campo Json,
 * y pasar `undefined` dentro del objeto de datos no es lo mismo que omitir
 * la clave. Esto la omite cuando no hay carga que guardar.
 */
function rawFor(rawPayload: unknown): { rawPayload?: Prisma.InputJsonValue } {
  return rawPayload === undefined ? {} : { rawPayload: rawPayload as Prisma.InputJsonValue }
}

function toOrderLine(item: OrderRow["items"][number]): OrderLine {
  return {
    id: item.id,
    variantId: item.variantId,
    productSlug: item.variant.product.slug,
    // Snapshots: lo que el cliente vio y aceptó, no lo que dice hoy el catálogo.
    productName: item.productNameSnapshot,
    variantName: item.variantNameSnapshot,
    unitPriceCents: Money.fromCents(item.unitPriceCents),
    quantity: item.quantity,
    lineTotalCents: Money.fromCents(item.lineTotalCents),
  }
}

function toSummary(row: OrderRow): OrderSummary {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    customerName: row.customer?.fullName ?? null,
    totalCents: Money.fromCents(row.totalCents),
    itemCount: row.items.reduce((total, item) => total + item.quantity, 0),
    createdAt: row.createdAt,
    expiresAt: row.status === "PENDING_PAYMENT" ? (row.movements[0]?.expiresAt ?? null) : null,
  }
}

function toDetail(row: OrderRow): OrderDetail {
  return {
    ...toSummary(row),
    email: row.customer?.email ?? null,
    phone: row.customer?.phone ?? null,
    shippingCity: row.shippingCity,
    shippingAddress: row.shippingAddress,
    notes: row.notes,
    subtotalCents: Money.fromCents(row.subtotalCents),
    shippingCents: Money.fromCents(row.shippingCents),
    discountCents: Money.fromCents(row.discountCents),
    lines: row.items.map(toOrderLine),
    paidAt: row.paidAt,
  }
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly shipping: ShippingPolicy,
  ) {}

  /**
   * Carrito → orden. Recalcula todos los importes desde la base (RF-10),
   * reserva el stock de cada línea y pasa a PENDING_PAYMENT. Si cualquier
   * línea se quedó sin stock mientras el cliente llenaba el formulario, la
   * transacción entera se deshace: no queda una orden a medio reservar.
   */
  async checkout(sessionId: Id, input: CheckoutInput): Promise<OrderDetail> {
    return this.db.$transaction(async (tx) => {
      const cart = await tx.order.findUnique({
        where: { draftSessionId: sessionId },
        include: {
          items: {
            orderBy: { id: "asc" },
            include: { variant: { include: { product: true } } },
          },
        },
      })
      if (!cart) throw new CheckoutError("No hay un carrito abierto en esta sesión")
      if (cart.items.length === 0) throw new CheckoutError("El carrito está vacío")

      assertTransition(cart.status, "PENDING_PAYMENT")

      const inventory = new PrismaInventoryService(tx)
      let subtotalCents = Money.zero()
      let itemCount = 0

      for (const item of cart.items) {
        const { variant } = item
        if (!variant.isActive || !variant.product.isActive) {
          throw new CheckoutError(`${variant.product.name} ya no está disponible`)
        }

        // Reserva primero: bloquea la fila y valida el stock. Si lanza, se
        // deshace todo lo reservado antes en este mismo bucle.
        await inventory.reserve(variant.id, item.quantity, cart.id, RESERVATION_TTL_MINUTES)

        const unitPriceCents = Money.fromCents(variant.priceCents)
        const lineTotalCents = Money.multiply(unitPriceCents, item.quantity)
        subtotalCents = Money.add(subtotalCents, lineTotalCents)
        itemCount += item.quantity

        // Ahora sí se congelan los snapshots, con el precio de este instante.
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            unitPriceCents,
            lineTotalCents,
            productNameSnapshot: variant.product.name,
            variantNameSnapshot: variant.name,
          },
        })
      }

      const shippingCents = shippingFor(itemCount, this.shipping)
      const customer = await this.resolveCustomer(tx, input)

      const row = await tx.order.update({
        where: { id: cart.id },
        data: {
          status: "PENDING_PAYMENT",
          // Deja de ser el carrito de la sesión: quien vuelva al catálogo
          // empieza uno nuevo en lugar de editar una orden ya cursada.
          draftSessionId: null,
          customerId: customer.id,
          subtotalCents,
          shippingCents,
          discountCents: 0,
          totalCents: Money.add(subtotalCents, shippingCents),
          shippingCity: input.shippingCity,
          shippingAddress: input.shippingAddress,
          notes: input.notes ?? null,
        },
        include: detailInclude,
      })
      return toDetail(row)
    })
  }

  async findByNumber(orderNumber: string, sessionId?: Id): Promise<OrderDetail | null> {
    const row = await this.db.order.findFirst({
      where: { orderNumber, ...(sessionId ? { sessionId } : {}) },
      include: detailInclude,
    })
    return row ? toDetail(row) : null
  }

  /** Listado del panel (RF-23). Nunca incluye carritos abandonados. */
  async list(query: OrderQuery): Promise<OrderPage> {
    const where: Prisma.OrderWhereInput = query.status
      ? { status: query.status }
      : { status: { not: "DRAFT" } }

    const [rows, total] = await Promise.all([
      this.db.order.findMany({
        where,
        include: detailInclude,
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(query.limit ?? 25, 1), 100),
        skip: Math.max(query.offset ?? 0, 0),
      }),
      this.db.order.count({ where }),
    ])
    return { items: rows.map(toSummary), total }
  }

  /**
   * Transición manual desde el panel, con su consecuencia de inventario:
   * cancelar algo pendiente devuelve la reserva, y cancelar o reembolsar
   * algo ya vendido devuelve la mercancía al libro como RETURN.
   */
  async changeStatus(orderId: Id, to: OrderStatus): Promise<OrderDetail> {
    return this.db.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      })
      if (!current) throw new OrderNotFoundError(orderId)

      assertTransition(current.status, to)

      const inventory = new PrismaInventoryService(tx)
      const releasing = to === "CANCELLED" || to === "EXPIRED"

      if (releasing && current.status === "PENDING_PAYMENT") {
        await inventory.releaseReservation(orderId)
      }
      if ((releasing || to === "REFUNDED") && current.status !== "PENDING_PAYMENT") {
        await inventory.restockSold(orderId)
      }

      const row = await tx.order.update({
        where: { id: orderId },
        data: { status: to },
        include: detailInclude,
      })
      return toDetail(row)
    })
  }

  /**
   * ADR-0003, punto 4 · un solo COMMIT para el estado de la orden, los
   * movimientos de inventario y el registro del pago.
   *
   * Es el punto más delicado del sistema. Tres cosas lo sostienen:
   *
   * 1. Se comprueba el importe contra el total de la orden. La firma de
   *    Wompi no cubre `reference`, así que sin esto un evento legítimo de
   *    mil pesos podría reenviarse apuntando a una orden de medio millón.
   * 2. Si la orden ya está PAID no se hace nada. El webhook reintenta y la
   *    reconciliación puede pisarlo; ninguno de los dos debe descontar dos
   *    veces (RF-13).
   * 3. `commitSale` es idempotente por su cuenta, así que ni siquiera un
   *    fallo a medio camino deja el libro descuadrado.
   */
  async applyPayment(
    orderNumber: string,
    payment: PaymentStatus,
    rawPayload?: unknown,
  ): Promise<OrderDetail> {
    return this.db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { orderNumber },
        select: { id: true, status: true, totalCents: true },
      })
      if (!order) throw new OrderNotFoundError(orderNumber)

      assertPayable({
        expectedCents: Money.fromCents(order.totalCents),
        actualCents: payment.amountCents,
        currency: payment.currency,
      })

      // El registro del pago se guarda siempre, incluso si no mueve la
      // orden: es la traza de qué dijo la pasarela y cuándo (RNF-07).
      await tx.payment.upsert({
        where: { providerTransactionId: payment.transactionId },
        update: { status: payment.status, method: payment.method, ...rawFor(rawPayload) },
        create: {
          orderId: order.id,
          providerTransactionId: payment.transactionId,
          status: payment.status,
          method: payment.method,
          amountCents: payment.amountCents,
          ...rawFor(rawPayload),
        },
      })

      const target = orderStatusForTransaction(payment.status)
      const yaResuelta = target === null || order.status === target

      if (!yaResuelta) {
        assertTransition(order.status, target)
        const inventory = new PrismaInventoryService(tx)

        if (target === "PAID") {
          await inventory.commitSale(order.id)
        } else {
          // Rechazado, anulado o con error: la reserva vuelve al catálogo
          // en el acto, sin esperar a que venza sola.
          await inventory.releaseReservation(order.id)
        }

        await tx.order.update({
          where: { id: order.id },
          data: { status: target, paidAt: target === "PAID" ? new Date() : null },
        })
      }

      return toDetail(
        await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: detailInclude }),
      )
    })
  }

  /**
   * RF-09 · libera lo que venció y marca la orden EXPIRED. Cada orden va en
   * su propia transacción para que una fallida no arrastre a las demás, y se
   * relee el estado dentro de ella porque el pago pudo entrar entre la
   * consulta y el momento de expirar.
   *
   * F3 añadirá aquí el paso de RF-15: preguntarle a Wompi por el estado real
   * de la transacción antes de dar por perdida la orden.
   */
  async expireStale(now: Date, reconcile?: PaymentReconciler): Promise<ExpiryReport> {
    const stale = await this.db.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        movements: { some: { reason: "RESERVATION", expiresAt: { lte: now } } },
      },
      select: {
        id: true,
        orderNumber: true,
        // Los ids que ya conocemos de esa orden: los deja el webhook, y
        // también el redirect al volver de la pasarela.
        payments: { select: { providerTransactionId: true } },
      },
    })

    let expired = 0
    let reconciled = 0

    for (const { id, orderNumber, payments } of stale) {
      // RF-15 · preguntar antes de dar por perdido. Si la pasarela dice que
      // se cobró, la orden se resuelve y no se expira: expirarla habría
      // dejado al cliente pagado y sin pedido.
      if (reconcile) {
        try {
          const payment = await reconcile({
            orderNumber,
            transactionIds: payments.map((p) => p.providerTransactionId),
          })
          if (payment && orderStatusForTransaction(payment.status) !== null) {
            await this.applyPayment(orderNumber, payment)
            reconciled += 1
            continue
          }
        } catch (error) {
          // Que la pasarela no conteste no puede bloquear al resto de
          // órdenes; esta se queda pendiente y se reintenta en la siguiente
          // pasada, que es más seguro que expirarla a ciegas.
          console.error(`[reconciliación] ${orderNumber} no se pudo consultar`, error)
          continue
        }
      }

      const didExpire = await this.db.$transaction(async (tx) => {
        // Se relee dentro de la transacción: el pago pudo entrar entre la
        // consulta inicial y este momento.
        const fresh = await tx.order.findUnique({ where: { id }, select: { status: true } })
        if (fresh?.status !== "PENDING_PAYMENT") return false

        await new PrismaInventoryService(tx).releaseReservation(id)
        await tx.order.update({ where: { id }, data: { status: "EXPIRED" } })
        return true
      })
      if (didExpire) expired += 1
    }

    return { expired, reconciled }
  }

  /** Reaprovecha el cliente si ya compró antes con el mismo correo. */
  private async resolveCustomer(
    tx: Prisma.TransactionClient,
    input: CheckoutInput,
  ): Promise<{ id: string }> {
    const existing = await tx.customer.findFirst({
      where: { email: input.email },
      select: { id: true },
    })
    if (existing) {
      await tx.customer.update({
        where: { id: existing.id },
        data: { fullName: input.fullName, phone: input.phone },
      })
      return existing
    }
    return tx.customer.create({
      data: { email: input.email, phone: input.phone, fullName: input.fullName },
      select: { id: true },
    })
  }
}
