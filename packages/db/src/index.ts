import { Money, type ShippingPolicy } from "@nexa/core"
import { PrismaClient } from "../generated/client/index.js"
import { resolveDatabaseUrl } from "./database-url"
import { PrismaCartRepository } from "./repositories/cart-repository"
import { PrismaInventoryService } from "./repositories/inventory-service"
import { PrismaOrderRepository } from "./repositories/order-repository"
import { PrismaChatRepository } from "./repositories/chat-repository"
import { PrismaProductRepository } from "./repositories/product-repository"
import { ResilientProductRepository } from "./repositories/resilient-product-repository"
import { StaticProductRepository } from "./repositories/static-product-repository"

// En desarrollo, Next.js recarga los módulos en cada cambio. Sin este
// singleton se abriría una conexión nueva por recarga hasta agotar el pool
// de PostgreSQL — y en Neon, el pool es pequeño.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const databaseUrlResolved = resolveDatabaseUrl(process.env.DATABASE_URL)

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(databaseUrlResolved ? { datasources: { db: { url: databaseUrlResolved } } } : {}),
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
export const productRepository = new ResilientProductRepository(
  databaseUrlResolved ? new PrismaProductRepository(prisma) : null,
  new StaticProductRepository(),
)
export const cartRepository = new PrismaCartRepository(prisma, shippingPolicy)
export const orderRepository = new PrismaOrderRepository(prisma, shippingPolicy)
export const inventoryService = new PrismaInventoryService(prisma)
export const chatRepository = new PrismaChatRepository(prisma)

export { PrismaChatRepository } from "./repositories/chat-repository"
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
export { hashPassword, verifyPassword } from "./admin/password"
export { embedQuery, embedTexts, voyageConfigured } from "./embeddings/voyage"
export { normalizeForSearch, slugify, toSku, transformCatalog } from "./legacy/transform"
export type { LegacyProduct, CatalogSeed } from "./legacy/transform"
export * from "../generated/client/index.js"
