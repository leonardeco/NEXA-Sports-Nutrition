// ─────────────────────────────────────────────────────────────────────────
//  Puertos del dominio — ADR-0001
//
//  Estas interfaces son la frontera. El dominio las declara; los adaptadores
//  (packages/db para Prisma, apps/web para Wompi y Anthropic) las implementan.
//  Nada de este archivo puede importar un framework: el lint lo impide.
// ─────────────────────────────────────────────────────────────────────────

import type { Cart } from "./cart"
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

// ═══════════════════════════════════════════════════════ CARRITO Y ÓRDENES ══

/**
 * El carrito es la orden DRAFT de una sesión anónima. `sessionId` es un
 * identificador opaco que viaja en una cookie httpOnly; nunca es el id de la
 * orden, para que nadie pueda leer el carrito ajeno cambiando su cookie.
 */
export interface CartRepository {
  /** Lectura sin efectos: no crea fila para quien solo mira el catálogo. */
  find(sessionId: Id): Promise<Cart | null>
  findOrCreate(sessionId: Id): Promise<Cart>
  /**
   * Añade o acumula cantidad sobre la variante. Devuelve también cómo quedó
   * resuelta la cantidad, porque RF-06 obliga a informar el recorte.
   */
  addItem(sessionId: Id, variantId: Id, quantity: number): Promise<CartMutation>
  setItemQuantity(sessionId: Id, itemId: Id, quantity: number): Promise<CartMutation>
  removeItem(sessionId: Id, itemId: Id): Promise<Cart>
}

export interface CartMutation {
  readonly cart: Cart
  /** true si la cantidad guardada quedó por debajo de la pedida (RF-06). */
  readonly capped: boolean
  readonly available: number
}

export interface CheckoutInput {
  readonly fullName: string
  readonly email: string
  readonly phone: string
  readonly shippingCity: string
  readonly shippingAddress: string
  readonly notes?: string | undefined
}

export interface OrderLine {
  readonly id: Id
  readonly variantId: Id
  readonly productSlug: Slug
  readonly productName: string
  readonly variantName: string
  readonly unitPriceCents: Cents
  readonly quantity: number
  readonly lineTotalCents: Cents
}

export interface OrderSummary {
  readonly id: Id
  readonly orderNumber: string
  readonly status: OrderStatus
  readonly customerName: string | null
  readonly totalCents: Cents
  readonly itemCount: number
  readonly createdAt: Date
  /** Solo en PENDING_PAYMENT: cuándo se libera la reserva (RF-09). */
  readonly expiresAt: Date | null
}

export interface OrderDetail extends OrderSummary {
  readonly email: string | null
  readonly phone: string | null
  readonly shippingCity: string | null
  readonly shippingAddress: string | null
  readonly notes: string | null
  readonly subtotalCents: Cents
  readonly shippingCents: Cents
  readonly discountCents: Cents
  readonly lines: readonly OrderLine[]
  readonly paidAt: Date | null
}

export interface OrderQuery {
  readonly status?: OrderStatus | undefined
  readonly limit?: number | undefined
  readonly offset?: number | undefined
}

export interface OrderPage {
  readonly items: readonly OrderSummary[]
  readonly total: number
}

/**
 * Consulta a la pasarela por el estado real de una orden.
 *
 * Recibe los ids de transacción que ya se conocen —del webhook, o del que la
 * pasarela añade al redirect— porque el único endpoint de consulta
 * documentado de Wompi busca por id, no por referencia. Sin ningún id no hay
 * nada que preguntar.
 */
export type PaymentReconciler = (order: {
  readonly orderNumber: string
  readonly transactionIds: readonly string[]
}) => Promise<PaymentStatus | null>

export interface ExpiryReport {
  /** Órdenes que se dieron por perdidas y devolvieron su stock. */
  readonly expired: number
  /** Órdenes que sí estaban pagadas y se resolvieron con la pasarela. */
  readonly reconciled: number
}

export interface OrderRepository {
  /**
   * Convierte el carrito en orden: recalcula los importes desde la base
   * (RF-10), reserva el stock y pasa a PENDING_PAYMENT. Todo dentro de una
   * transacción — no puede existir un instante con la orden pendiente y el
   * stock sin reservar.
   */
  checkout(sessionId: Id, input: CheckoutInput): Promise<OrderDetail>
  /**
   * Con `sessionId` devuelve la orden solo si pertenece a esa sesión, que es
   * como la ve el cliente: el número de orden se dicta por WhatsApp y por
   * teléfono, así que por sí solo no puede dar acceso a una dirección de
   * entrega. Sin él —solo desde el panel— devuelve cualquiera.
   */
  findByNumber(orderNumber: string, sessionId?: Id): Promise<OrderDetail | null>
  list(query: OrderQuery): Promise<OrderPage>
  /** Transición manual desde el panel. Valida contra la máquina de estados. */
  changeStatus(orderId: Id, to: OrderStatus): Promise<OrderDetail>
  /**
   * Aplica el resultado de un pago (ADR-0003, punto 4): cambio de estado,
   * movimientos de inventario y registro del pago en un solo COMMIT. No
   * existe un instante en que la orden esté pagada y el stock intacto.
   *
   * Idempotente: reaplicar el mismo resultado no vuelve a descontar. Es lo
   * que permite que Wompi reintente y que la reconciliación pise al webhook
   * sin consecuencias.
   */
  applyPayment(
    orderNumber: string,
    payment: PaymentStatus,
    rawPayload?: unknown,
  ): Promise<OrderDetail>
  /**
   * RF-09 y RF-15 · resuelve las órdenes cuyo plazo venció.
   *
   * Antes de dar una por perdida se le pregunta a la pasarela por su estado
   * real, si se le pasa con qué preguntar. Ese es el caso del webhook que
   * nunca llegó: el más común y el más caro de esta integración, porque deja
   * al cliente cobrado y sin pedido.
   *
   * `reconcile` se inyecta porque el adaptador de la pasarela vive en la
   * aplicación, no aquí. Sin él, expira sin preguntar.
   *
   * Idempotente: correrlo dos veces no libera dos veces el mismo stock.
   */
  expireStale(now: Date, reconcile?: PaymentReconciler): Promise<ExpiryReport>
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

export type PaymentResult = "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "PENDING"

export interface PaymentStatus {
  readonly transactionId: string
  /** La referencia que se le envió a la pasarela: es el `orderNumber`. */
  readonly reference: string
  readonly status: PaymentResult
  readonly amountCents: Cents
  readonly currency: string
  readonly method: string | null
}

/** Pasarela de pagos — ADR-0003. Implementado por el adaptador de Wompi. */
export interface PaymentGateway {
  /**
   * No hace red: con Checkout Web la "intención" es la firma de integridad,
   * que se calcula en local. Por eso es síncrona — fingir una promesa aquí
   * sugeriría una llamada externa que no existe.
   */
  createIntent(reference: string, amountCents: Cents): PaymentIntent
  /**
   * Verifica el checksum del evento ANTES de tocar la base de datos. Recibe
   * el cuerpo sin validar y devuelve el evento si cuadra, o null.
   */
  verifyEvent(body: unknown): { transaction: PaymentStatus; eventId: string } | null
  /** Reconciliación (RF-15): el estado real cuando el webhook no llegó. */
  fetchById(transactionId: string): Promise<PaymentStatus | null>
}
