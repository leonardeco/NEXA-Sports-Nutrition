import { Money, type ShippingPolicy } from "@nexa/core"
import { PrismaClient } from "../generated/client/index.js"
import { PrismaCartRepository } from "./repositories/cart-repository"
import { PrismaInventoryService } from "./repositories/inventory-service"
import { PrismaOrderRepository } from "./repositories/order-repository"
import { PrismaProductRepository } from "./repositories/product-repository"

// En desarrollo, Next.js recarga los módulos en cada cambio. Sin este
// singleton se abriría una conexión nueva por recarga hasta agotar el pool
// de PostgreSQL — y en Neon, el pool es pequeño.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

/**
 * Tarifa plana de envío nacional. Es configuración de servidor: se lee del
 * entorno para poder cambiarla sin desplegar código. $12.000 por defecto.
 */
export const shippingPolicy: ShippingPolicy = {
  flatRateCents: Money.fromCents(Number(process.env.NEXA_SHIPPING_FLAT_CENTS ?? 1_200_000)),
}

/** Únicos puntos de entrada al dominio desde la aplicación. */
export const productRepository = new PrismaProductRepository(prisma)
export const cartRepository = new PrismaCartRepository(prisma, shippingPolicy)
export const orderRepository = new PrismaOrderRepository(prisma, shippingPolicy)
export const inventoryService = new PrismaInventoryService(prisma)

export { PrismaProductRepository }
export { CartNotFoundError, PrismaCartRepository, newOrderNumber } from "./repositories/cart-repository"
export {
  CheckoutError,
  OrderNotFoundError,
  PrismaOrderRepository,
} from "./repositories/order-repository"
export {
  InsufficientStockError,
  InventoryError,
  PrismaInventoryService,
} from "./repositories/inventory-service"
export type { PrismaLike } from "./repositories/inventory-service"
export { normalizeForSearch, slugify, toSku, transformCatalog } from "./legacy/transform"
export type { LegacyProduct, CatalogSeed } from "./legacy/transform"
export * from "../generated/client/index.js"
