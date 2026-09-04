// ─────────────────────────────────────────────────────────────────────────
//  Criterio de cierre de F2: "una orden se crea, reserva stock y expira
//  sola". Esto no se puede probar con dobles — depende de la transacción,
//  del índice único y de que el libro de movimientos cuadre — así que corre
//  contra PostgreSQL de verdad, con el catálogo ya sembrado.
//
//  Cada caso deja el stock como lo encontró.
// ─────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { Money, type CheckoutInput, type PaymentStatus } from "@nexa/core"
import { PrismaClient } from "../../generated/client/index.js"
import { PrismaCartRepository } from "./cart-repository"
import { InsufficientStockError, PrismaInventoryService } from "./inventory-service"
import { PrismaOrderRepository } from "./order-repository"

const prisma = new PrismaClient()
const shipping = { flatRateCents: Money.fromCOP(12_000) }
const carts = new PrismaCartRepository(prisma, shipping)
const orders = new PrismaOrderRepository(prisma, shipping)

const CUSTOMER: CheckoutInput = {
  fullName: "Cliente de prueba",
  email: `prueba-${randomUUID()}@nexa.test`,
  phone: "3226993891",
  shippingCity: "Bogotá",
  shippingAddress: "Calle 1 # 2-3",
}

let variantId: string
let originalStock: number
const createdOrderIds: string[] = []

/** Borra la orden y sus movimientos para no dejar rastro en el libro. */
async function cleanup(): Promise<void> {
  for (const orderId of createdOrderIds.splice(0)) {
    await prisma.inventoryMovement.deleteMany({ where: { orderId } })
    await prisma.order.deleteMany({ where: { id: orderId } })
  }
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { stock: originalStock },
  })
}

async function newSession(): Promise<string> {
  return `test-${randomUUID()}`
}

async function stockNow(): Promise<number> {
  const variant = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { stock: true },
  })
  return variant.stock
}

async function trackCart(sessionId: string): Promise<string> {
  const cart = await carts.findOrCreate(sessionId)
  createdOrderIds.push(cart.id)
  return cart.id
}

beforeAll(async () => {
  const variant = await prisma.productVariant.findFirstOrThrow({
    where: { isActive: true, stock: { gte: 5 }, product: { isActive: true } },
    select: { id: true, stock: true },
    orderBy: { id: "asc" },
  })
  variantId = variant.id
  originalStock = variant.stock
})

afterEach(cleanup)

describe("carrito", () => {
  it("añade una variante y calcula subtotal, envío y total", async () => {
    const session = await newSession()
    await trackCart(session)

    const { cart, capped } = await carts.addItem(session, variantId, 2)

    expect(capped).toBe(false)
    expect(cart.itemCount).toBe(2)
    expect(cart.shippingCents).toBe(Money.fromCOP(12_000))
    expect(cart.totalCents).toBe(Money.add(cart.subtotalCents, cart.shippingCents))
  })

  it("acumula al añadir la misma variante dos veces", async () => {
    const session = await newSession()
    await trackCart(session)

    await carts.addItem(session, variantId, 1)
    const { cart } = await carts.addItem(session, variantId, 2)

    expect(cart.lines).toHaveLength(1)
    expect(cart.itemCount).toBe(3)
  })

  it("recorta la cantidad al stock disponible e informa (RF-06)", async () => {
    const session = await newSession()
    await trackCart(session)

    const { cart, capped, available } = await carts.addItem(session, variantId, originalStock + 50)

    expect(capped).toBe(true)
    expect(available).toBe(originalStock)
    expect(cart.itemCount).toBe(originalStock)
  })

  it("no reserva stock mientras el carrito sigue abierto", async () => {
    const session = await newSession()
    await trackCart(session)
    await carts.addItem(session, variantId, 3)

    // Llenar el carrito no puede agotarle el producto a los demás.
    expect(await stockNow()).toBe(originalStock)
  })

  it("devuelve un solo carrito por sesión aunque se pida dos veces a la vez", async () => {
    const session = await newSession()

    const [a, b] = await Promise.all([carts.findOrCreate(session), carts.findOrCreate(session)])
    createdOrderIds.push(a.id, b.id)

    expect(a.id).toBe(b.id)
  })

  it("quita una línea", async () => {
    const session = await newSession()
    await trackCart(session)
    const { cart } = await carts.addItem(session, variantId, 2)

    const empty = await carts.removeItem(session, cart.lines[0]!.id)

    expect(empty.lines).toHaveLength(0)
    expect(empty.totalCents).toBe(0)
  })

  it("no deja tocar el carrito de otra sesión", async () => {
    const owner = await newSession()
    await trackCart(owner)
    const { cart } = await carts.addItem(owner, variantId, 1)

    const intruder = await newSession()
    await trackCart(intruder)

    await expect(carts.removeItem(intruder, cart.lines[0]!.id)).rejects.toThrow()
  })
})

describe("checkout", () => {
  it("crea la orden, reserva el stock y la deja pendiente de pago", async () => {
    const session = await newSession()
    await trackCart(session)
    await carts.addItem(session, variantId, 2)

    const order = await orders.checkout(session, CUSTOMER)

    expect(order.status).toBe("PENDING_PAYMENT")
    expect(order.orderNumber).toMatch(/^NEXA-\d{6}-[0-9A-Z]{6}$/)
    expect(order.lines).toHaveLength(1)
    expect(order.shippingCents).toBe(Money.fromCOP(12_000))
    expect(order.totalCents).toBe(Money.add(order.subtotalCents, order.shippingCents))
    expect(await stockNow()).toBe(originalStock - 2)
  })

  it("escribe el movimiento de reserva con su vencimiento (RF-08)", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { orderId: cartId, reason: "RESERVATION" },
    })

    expect(movement.delta).toBe(-2)
    expect(movement.expiresAt).not.toBeNull()
    // 30 minutos por delante, con holgura para la latencia de la red.
    const minutes = (movement.expiresAt!.getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(28)
    expect(minutes).toBeLessThanOrEqual(30)
  })

  it("cierra el carrito: la sesión empieza uno nuevo después de pagar", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 1)
    await orders.checkout(session, CUSTOMER)

    const nextCart = await carts.findOrCreate(session)
    createdOrderIds.push(nextCart.id)

    expect(nextCart.id).not.toBe(cartId)
    expect(nextCart.lines).toHaveLength(0)
  })

  it("rechaza un carrito vacío", async () => {
    const session = await newSession()
    await trackCart(session)

    await expect(orders.checkout(session, CUSTOMER)).rejects.toThrow()
  })

  it("no deja la orden a medias si falta stock", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 3)

    // Alguien se lleva las existencias entre el carrito y el checkout.
    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 1 } })

    await expect(orders.checkout(session, CUSTOMER)).rejects.toThrow(InsufficientStockError)

    const order = await prisma.order.findUniqueOrThrow({ where: { id: cartId } })
    expect(order.status).toBe("DRAFT")
    expect(await stockNow()).toBe(1)
  })
})

describe("expiración (RF-09)", () => {
  it("no expira una orden que aún está dentro de su plazo", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)

    await orders.expireStale(new Date())

    const order = await prisma.order.findUniqueOrThrow({ where: { id: cartId } })
    expect(order.status).toBe("PENDING_PAYMENT")
    expect(await stockNow()).toBe(originalStock - 2)
  })

  it("expira sola y devuelve el stock al catálogo", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)
    expect(await stockNow()).toBe(originalStock - 2)

    // Adelantar el reloj de la reserva en lugar de esperar media hora.
    await prisma.inventoryMovement.updateMany({
      where: { orderId: cartId, reason: "RESERVATION" },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    const { expired } = await orders.expireStale(new Date())

    expect(expired).toBeGreaterThanOrEqual(1)
    const order = await prisma.order.findUniqueOrThrow({ where: { id: cartId } })
    expect(order.status).toBe("EXPIRED")
    expect(await stockNow()).toBe(originalStock)
  })

  it("correr el job dos veces no devuelve el stock dos veces", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)
    await prisma.inventoryMovement.updateMany({
      where: { orderId: cartId, reason: "RESERVATION" },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    await orders.expireStale(new Date())
    await orders.expireStale(new Date())

    expect(await stockNow()).toBe(originalStock)
  })
})

describe("pagos (ADR-0003)", () => {
  /** Deja el carrito hecho orden y devuelve lo que Wompi diría de ella. */
  async function ordenPendiente(unidades = 2) {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, unidades)
    const order = await orders.checkout(session, CUSTOMER)

    const aprobado: PaymentStatus = {
      transactionId: `txn-${randomUUID()}`,
      reference: order.orderNumber,
      status: "APPROVED",
      amountCents: order.totalCents,
      currency: "COP",
      method: "NEQUI",
    }
    return { cartId, order, aprobado }
  }

  it("aprobado deja la orden PAID con el stock descontado", async () => {
    const { order, aprobado } = await ordenPendiente()
    expect(await stockNow()).toBe(originalStock - 2)

    const pagada = await orders.applyPayment(order.orderNumber, aprobado)

    expect(pagada.status).toBe("PAID")
    expect(pagada.paidAt).not.toBeNull()
    // La unidad ya salió al reservarse: cobrar no la descuenta otra vez.
    expect(await stockNow()).toBe(originalStock - 2)
  })

  it("escribe la venta en el libro y el pago en su tabla", async () => {
    const { cartId, order, aprobado } = await ordenPendiente()
    await orders.applyPayment(order.orderNumber, aprobado, { evento: "de prueba" })

    const venta = await prisma.inventoryMovement.findFirstOrThrow({
      where: { orderId: cartId, reason: "SALE" },
    })
    expect(venta.delta).toBe(-2)

    const pago = await prisma.payment.findUniqueOrThrow({
      where: { providerTransactionId: aprobado.transactionId },
    })
    expect(pago.status).toBe("APPROVED")
    expect(pago.amountCents).toBe(order.totalCents)
    expect(pago.rawPayload).toEqual({ evento: "de prueba" })
  })

  it("reaplicar el mismo pago no descuenta dos veces (RF-13)", async () => {
    const { cartId, order, aprobado } = await ordenPendiente()

    await orders.applyPayment(order.orderNumber, aprobado)
    await orders.applyPayment(order.orderNumber, aprobado)
    await orders.applyPayment(order.orderNumber, aprobado)

    expect(await stockNow()).toBe(originalStock - 2)
    const ventas = await prisma.inventoryMovement.count({
      where: { orderId: cartId, reason: "SALE" },
    })
    expect(ventas).toBe(1)
  })

  it("rechazado devuelve el stock sin esperar a que venza la reserva", async () => {
    const { order, aprobado } = await ordenPendiente()

    const fallida = await orders.applyPayment(order.orderNumber, {
      ...aprobado,
      status: "DECLINED",
    })

    expect(fallida.status).toBe("PAYMENT_FAILED")
    expect(await stockNow()).toBe(originalStock)
  })

  it("pendiente no mueve la orden ni el stock", async () => {
    const { order, aprobado } = await ordenPendiente()

    const igual = await orders.applyPayment(order.orderNumber, {
      ...aprobado,
      status: "PENDING",
    })

    expect(igual.status).toBe("PENDING_PAYMENT")
    expect(await stockNow()).toBe(originalStock - 2)
  })

  it("rechaza un pago cuyo importe no es el de la orden", async () => {
    // El ataque que la firma de Wompi NO cubre: reenviar un evento legítimo
    // de mil pesos apuntando a la referencia de una orden grande.
    const { cartId, order, aprobado } = await ordenPendiente()

    await expect(
      orders.applyPayment(order.orderNumber, {
        ...aprobado,
        amountCents: Money.fromCOP(1_000),
      }),
    ).rejects.toThrow(/no coincide/)

    const sinTocar = await prisma.order.findUniqueOrThrow({ where: { id: cartId } })
    expect(sinTocar.status).toBe("PENDING_PAYMENT")
    expect(await stockNow()).toBe(originalStock - 2)
  })

  it("rechaza un pago en otra moneda", async () => {
    const { order, aprobado } = await ordenPendiente()

    await expect(
      orders.applyPayment(order.orderNumber, { ...aprobado, currency: "USD" }),
    ).rejects.toThrow(/Moneda/)
  })

  it("no inventa una orden que no existe", async () => {
    const { aprobado } = await ordenPendiente()

    await expect(
      orders.applyPayment("NEXA-000000-XXXXXX", aprobado),
    ).rejects.toThrow()
  })
})

describe("reconciliación (RF-15)", () => {
  /** Adelanta el reloj de la reserva para no esperar media hora. */
  async function vencer(orderId: string) {
    await prisma.inventoryMovement.updateMany({
      where: { orderId, reason: "RESERVATION" },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })
  }

  it("no expira una orden que la pasarela dice que sí se pagó", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    const order = await orders.checkout(session, CUSTOMER)
    await vencer(cartId)

    // El webhook nunca llegó, pero el cobro sí ocurrió.
    const report = await orders.expireStale(new Date(), async () => ({
      transactionId: `txn-${randomUUID()}`,
      reference: order.orderNumber,
      status: "APPROVED" as const,
      amountCents: order.totalCents,
      currency: "COP",
      method: "PSE",
    }))

    expect(report.reconciled).toBeGreaterThanOrEqual(1)
    const resuelta = await prisma.order.findUniqueOrThrow({ where: { id: cartId } })
    expect(resuelta.status).toBe("PAID")
    // Se vendió: el stock NO vuelve al catálogo.
    expect(await stockNow()).toBe(originalStock - 2)
  })

  it("expira cuando la pasarela no sabe nada de la orden", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)
    await vencer(cartId)

    const report = await orders.expireStale(new Date(), async () => null)

    expect(report.expired).toBeGreaterThanOrEqual(1)
    const expirada = await prisma.order.findUniqueOrThrow({ where: { id: cartId } })
    expect(expirada.status).toBe("EXPIRED")
    expect(await stockNow()).toBe(originalStock)
  })

  it("no expira a ciegas si la pasarela no contesta", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)
    await vencer(cartId)

    const report = await orders.expireStale(new Date(), async () => {
      throw new Error("Wompi no responde")
    })

    expect(report.expired).toBe(0)
    const pendiente = await prisma.order.findUniqueOrThrow({ where: { id: cartId } })
    expect(pendiente.status).toBe("PENDING_PAYMENT")
    // El stock sigue apartado: se reintentará en la próxima pasada.
    expect(await stockNow()).toBe(originalStock - 2)
  })
})

describe("libro de inventario (ADR-0004)", () => {
  it("convierte la reserva en venta sin mover el stock otra vez", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)

    await new PrismaInventoryService(prisma).commitSale(cartId)

    // La unidad ya salió al reservarse: vender no la descuenta de nuevo.
    expect(await stockNow()).toBe(originalStock - 2)

    const sale = await prisma.inventoryMovement.findFirstOrThrow({
      where: { orderId: cartId, reason: "SALE" },
    })
    expect(sale.delta).toBe(-2)
  })

  it("no descuenta dos veces si el webhook se repite (RF-13)", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)

    const inventory = new PrismaInventoryService(prisma)
    await inventory.commitSale(cartId)
    await inventory.commitSale(cartId)
    await inventory.commitSale(cartId)

    expect(await stockNow()).toBe(originalStock - 2)
    const sales = await prisma.inventoryMovement.count({
      where: { orderId: cartId, reason: "SALE" },
    })
    expect(sales).toBe(1)
  })

  it("no reporta descuadre entre el caché y el libro", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)
    await new PrismaInventoryService(prisma).commitSale(cartId)

    // Ejercita el SQL a mano de findDrift, que es donde se cuelan los
    // nombres de columna equivocados sin que TypeScript diga nada.
    const drift = await new PrismaInventoryService(prisma).findDrift()
    expect(drift.filter((d) => d.variantId === variantId)).toHaveLength(0)
  })

  it("cuadra el caché de stock con la suma del libro", async () => {
    const session = await newSession()
    const cartId = await trackCart(session)
    await carts.addItem(session, variantId, 2)
    await orders.checkout(session, CUSTOMER)
    await new PrismaInventoryService(prisma).commitSale(cartId)

    const movements = await prisma.inventoryMovement.aggregate({
      where: { variantId },
      _sum: { delta: true },
    })
    expect(movements._sum.delta).toBe(await stockNow())
  })
})
