// ─────────────────────────────────────────────────────────────────────────
//  Puertos del dominio — ADR-0001
//
//  Estas interfaces son la frontera. El dominio las declara; los adaptadores
//  (packages/db para Prisma, apps/web para Wompi y Anthropic) las implementan.
//  Nada de este archivo puede importar un framework: el lint lo impide.
// ─────────────────────────────────────────────────────────────────────────

import type { Cents } from "./money"

export type Slug = string
export type Id = string

/** Motivos de movimiento de inventario — ADR-0004. */
export type InventoryReason =
  | "RESTOCK"
  | "SALE"
  | "RESERVATION"
  | "RESERVATION_RELEASE"
  | "ADJUSTMENT"
  | "RETURN"

/** Estados de una orden. Las transiciones válidas se definen en F2. */
export type OrderStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PAID"
  | "PREPARING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "PAYMENT_FAILED"
  | "EXPIRED"
  | "REFUNDED"

// ══════════════════════════════════════════════════════════════ CATÁLOGO ══

export interface ImageRef {
  url: string
  alt: string
}

export interface BrandRef {
  slug: Slug
  name: string
  color: string | null
  accent: string | null
  logoUrl: string | null
}

export interface CategoryRef {
  slug: Slug
  name: string
}

export interface VariantSummary {
  id: Id
  sku: string
  name: string
  priceCents: Cents
  stock: number
  isDefault: boolean
}

export interface ProductSummary {
  id: Id
  slug: Slug
  name: string
  badge: string | null
  isFeatured: boolean
  brand: BrandRef
  category: CategoryRef
  image: ImageRef | null
  /** Precio de la variante por defecto. */
  priceCents: Cents
  /** Suma del stock de todas las variantes activas. */
  stock: number
}

export interface ProductDetail extends ProductSummary {
  description: string | null
  benefits: string | null
  usageInstructions: string | null
  images: readonly ImageRef[]
  variants: readonly VariantSummary[]
}

export type ProductSort = "relevancia" | "precio-asc" | "precio-desc" | "nombre"

export interface ProductQuery {
  readonly search?: string
  readonly brand?: Slug
  readonly category?: Slug
  readonly minPriceCents?: Cents
  readonly maxPriceCents?: Cents
  readonly onlyFeatured?: boolean
  readonly sort?: ProductSort
  readonly limit?: number
  readonly offset?: number
}

export interface ProductPage {
  readonly items: readonly ProductSummary[]
  readonly total: number
}

/** Lectura del catálogo. Implementado por packages/db. */
export interface ProductRepository {
  findBySlug(slug: Slug): Promise<ProductDetail | null>
  search(query: ProductQuery): Promise<ProductPage>
  listFeatured(limit: number): Promise<readonly ProductSummary[]>
  listBrands(): Promise<readonly BrandRef[]>
  listCategories(): Promise<readonly CategoryRef[]>
}

// ════════════════════════════════════════════════════════════ INVENTARIO ══

/**
 * Inventario como libro de movimientos — ADR-0004.
 * `reserve` y `commitSale` deben ejecutarse dentro de la misma transacción
 * que el cambio de estado de la orden: no puede existir una ventana donde la
 * orden esté pagada y el stock intacto.
 */
export interface InventoryService {
  availableStock(variantId: Id): Promise<number>
  reserve(variantId: Id, quantity: number, orderId: Id, ttlMinutes: number): Promise<void>
  releaseReservation(orderId: Id): Promise<void>
  commitSale(orderId: Id): Promise<void>
  record(variantId: Id, delta: number, reason: InventoryReason, note?: string): Promise<void>
}

// ════════════════════════════════════════════════════════════════ PAGOS ══

export interface PaymentIntent {
  reference: string
  amountCents: Cents
  currency: "COP"
  signature: string
  publicKey: string
  redirectUrl: string
}

export interface PaymentStatus {
  transactionId: string
  status: "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "PENDING"
  amountCents: Cents
  method: string | null
}

/** Pasarela de pagos — ADR-0003. Implementado por el adaptador de Wompi. */
export interface PaymentGateway {
  createIntent(reference: string, amountCents: Cents): Promise<PaymentIntent>
  /** Verifica la firma del webhook ANTES de tocar la base de datos. */
  verifyWebhookSignature(rawBody: string, checksum: string, timestamp: string): boolean
  /** Reconciliación: consulta el estado real cuando el webhook no llegó. */
  fetchTransaction(transactionId: string): Promise<PaymentStatus>
}
