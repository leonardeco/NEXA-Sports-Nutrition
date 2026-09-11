// ─────────────────────────────────────────────────────────────────────────
//  Adaptador Prisma del puerto ProductRepository — ADR-0001
//  El dominio declara la interfaz; aquí vive la única implementación que
//  sabe de SQL. Si mañana el catálogo se sirve desde otro sitio, se cambia
//  este archivo y nada más.
// ─────────────────────────────────────────────────────────────────────────

import {
  AdminProductError,
  Money,
  adjustmentDelta,
  pickEditableVariant,
  reciprocalRankFusion,
  vectorLiteral,
  type BrandRef,
  type CategoryRef,
  type ImageRef,
  type ProductDetail,
  type ProductPage,
  type ProductQuery,
  type ProductRepository,
  type ProductSummary,
  type Slug,
  type VariantSummary,
} from "@nexa/core"
import { Prisma, type PrismaClient } from "../../generated/client/index.js"
import { normalizeForSearch } from "../legacy/transform"
import { PrismaInventoryService } from "./inventory-service.js"

const summaryInclude = {
  brand: true,
  category: true,
  images: { orderBy: { sortOrder: "asc" } },
  variants: { where: { isActive: true }, orderBy: { isDefault: "desc" } },
} satisfies Prisma.ProductInclude

type ProductRow = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>

function toBrandRef(brand: ProductRow["brand"]): BrandRef {
  return {
    slug: brand.slug,
    name: brand.name,
    color: brand.color,
    accent: brand.accent,
    logoUrl: brand.logoUrl,
  }
}

function toImageRef(image: ProductRow["images"][number]): ImageRef {
  return { url: image.url, alt: image.alt ?? "" }
}

function toVariantSummary(v: ProductRow["variants"][number]): VariantSummary {
  return {
    id: v.id,
    sku: v.sku,
    name: v.name,
    priceCents: Money.fromCents(v.priceCents),
    stock: v.stock,
    isDefault: v.isDefault,
  }
}

function toSummary(row: ProductRow): ProductSummary {
  const variants = row.variants.map(toVariantSummary)
  const principal = variants.find((v) => v.isDefault) ?? variants[0]

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    badge: row.badge,
    isFeatured: row.isFeatured,
    isActive: row.isActive,
    brand: toBrandRef(row.brand),
    category: { slug: row.category.slug, name: row.category.name },
    image: row.images[0] ? toImageRef(row.images[0]) : null,
    priceCents: principal?.priceCents ?? Money.zero(),
    stock: variants.reduce((sum, v) => sum + v.stock, 0),
  }
}

function toDetail(row: ProductRow): ProductDetail {
  return {
    ...toSummary(row),
    description: row.description,
    benefits: row.benefits,
    usageInstructions: row.usageInstructions,
    images: row.images.map(toImageRef),
    variants: row.variants.map(toVariantSummary),
  }
}

function buildWhere(query: ProductQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { isActive: true }

  if (query.brand) where.brand = { slug: query.brand }
  if (query.category) where.category = { slug: query.category }
  if (query.onlyFeatured) where.isFeatured = true

  // El mismo normalizado que se aplicó al indexar: por eso "proteina"
  // encuentra "Proteínas" sin recurrir a SQL crudo.
  const termino = query.search ? normalizeForSearch(query.search) : ""
  if (termino.length > 0) {
    where.AND = termino
      .split(" ")
      .filter(Boolean)
      .map((palabra) => ({ searchText: { contains: palabra } }))
  }

  const priceFilter: Prisma.IntFilter = {}
  if (query.minPriceCents !== undefined) priceFilter.gte = query.minPriceCents
  if (query.maxPriceCents !== undefined) priceFilter.lte = query.maxPriceCents
  if (Object.keys(priceFilter).length > 0) {
    where.variants = { some: { isActive: true, priceCents: priceFilter } }
  }

  return where
}

function sortSummaries(
  items: ProductSummary[],
  sort: ProductQuery["sort"],
): ProductSummary[] {
  if (sort === "precio-asc") {
    return [...items].sort((a, b) => a.priceCents - b.priceCents)
  }
  if (sort === "precio-desc") {
    return [...items].sort((a, b) => b.priceCents - a.priceCents)
  }
  if (sort === "nombre") {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, "es"))
  }
  return items
}

function buildOrderBy(sort: ProductQuery["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "nombre":
      return [{ name: "asc" }]
    case "precio-asc":
    case "precio-desc":
      // El orden por precio se resuelve en memoria sobre la página, porque
      // el precio vive en la variante y no en el producto.
      return [{ name: "asc" }]
    case "relevancia":
    default:
      return [{ isFeatured: "desc" }, { name: "asc" }]
  }
}

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly db: PrismaClient) {}

  async findBySlug(slug: Slug): Promise<ProductDetail | null> {
    const row = await this.db.product.findFirst({
      where: { slug, isActive: true },
      include: summaryInclude,
    })
    return row ? toDetail(row) : null
  }

  async findById(id: string): Promise<ProductDetail | null> {
    const row = await this.db.product.findFirst({
      where: { id, isActive: true },
      include: summaryInclude,
    })
    return row ? toDetail(row) : null
  }

  async findBySlugForAdmin(slug: Slug): Promise<ProductDetail | null> {
    const row = await this.db.product.findFirst({
      where: { slug },
      include: summaryInclude,
    })
    return row ? toDetail(row) : null
  }

  async listForAdmin(query: ProductQuery): Promise<ProductPage> {
    const take = Math.min(Math.max(query.limit ?? 24, 1), 100)
    const skip = Math.max(query.offset ?? 0, 0)
    const termino = query.search ? normalizeForSearch(query.search) : ""
    const where: Prisma.ProductWhereInput = {}
    if (termino.length > 0) {
      where.AND = termino
        .split(" ")
        .filter(Boolean)
        .map((palabra) => ({ searchText: { contains: palabra } }))
    }
    const [rows, total] = await Promise.all([
      this.db.product.findMany({
        where,
        include: summaryInclude,
        orderBy: { name: "asc" },
        take,
        skip,
      }),
      this.db.product.count({ where }),
    ])
    return { items: rows.map(toSummary), total }
  }

  /**
   * Precio, stock y visibilidad del panel, en un solo COMMIT.
   * El stock solo se mueve por el libro (ADR-0004): nunca se escribe
   * la columna a un valor absoluto.
   */
  async applyAdminProductChange(
    slug: Slug,
    input: { readonly priceCop?: number; readonly stock?: number; readonly isActive?: boolean },
    actorId: string,
  ): Promise<ProductDetail> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.product.findFirst({
        where: { slug },
        include: summaryInclude,
      })
      if (!row) throw new AdminProductError("No encontrado")
      const variant = pickEditableVariant(toDetail(row).variants)
      if (!variant) throw new AdminProductError("Este producto no tiene variante para editar")

      const diff: Record<string, unknown> = {}
      const inventory = new PrismaInventoryService(tx)

      if (input.priceCop !== undefined) {
        const next = Money.fromCOP(input.priceCop)
        if (next !== variant.priceCents) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { priceCents: next },
          })
          diff.priceCents = { from: variant.priceCents, to: next }
        }
      }

      if (input.stock !== undefined) {
        const locked = await tx.$queryRaw<{ stock: number }[]>`
          SELECT stock FROM product_variants WHERE id = ${variant.id} FOR UPDATE
        `
        const current = locked[0]?.stock
        if (current === undefined) {
          throw new AdminProductError("Este producto no tiene variante para editar")
        }
        const delta = adjustmentDelta(current, input.stock)
        if (delta !== 0) {
          await inventory.record(variant.id, delta, "ADJUSTMENT", "Ajuste desde el panel")
          diff.stock = { from: current, to: input.stock }
        }
      }

      if (input.isActive !== undefined && input.isActive !== row.isActive) {
        await tx.product.update({
          where: { id: row.id },
          data: { isActive: input.isActive },
        })
        diff.isActive = { from: row.isActive, to: input.isActive }
      }

      if (Object.keys(diff).length > 0) {
        await tx.auditLog.create({
          data: {
            actorId,
            action: "update",
            entity: "product",
            entityId: row.id,
            diff: diff as Prisma.InputJsonValue,
          },
        })
      }

      const updated = await tx.product.findFirst({
        where: { slug },
        include: summaryInclude,
      })
      if (!updated) throw new AdminProductError("No encontrado")
      return toDetail(updated)
    })
  }

  async search(
    query: ProductQuery,
    queryEmbedding: readonly number[] | null = null,
  ): Promise<ProductPage> {
    const where = buildWhere(query)
    const take = Math.min(Math.max(query.limit ?? 24, 1), 100)
    const skip = Math.max(query.offset ?? 0, 0)
    const termino = query.search ? normalizeForSearch(query.search) : ""

    if (!termino) {
      const [rows, total] = await Promise.all([
        this.db.product.findMany({
          where,
          include: summaryInclude,
          orderBy: buildOrderBy(query.sort),
          take,
          skip,
        }),
        this.db.product.count({ where }),
      ])
      return { items: sortSummaries(rows.map(toSummary), query.sort), total }
    }

    const textRows = await this.db.product.findMany({
      where,
      select: { id: true },
      orderBy: buildOrderBy(query.sort === "relevancia" ? "relevancia" : query.sort),
      take: 50,
    })
    const textIds = textRows.map((row) => row.id)
    const semanticIds = await this.semanticIds(queryEmbedding, 50)
    const fused = reciprocalRankFusion(
      semanticIds.length > 0 ? [textIds, semanticIds] : [textIds],
    )
    const pageIds = fused.slice(skip, skip + take)
    if (pageIds.length === 0) {
      return { items: [], total: fused.length }
    }

    const rows = await this.db.product.findMany({
      where: { id: { in: pageIds }, isActive: true },
      include: summaryInclude,
    })
    const byId = new Map(rows.map((row) => [row.id, toSummary(row)]))
    const items = sortSummaries(
      pageIds.map((id) => byId.get(id)).filter((item): item is ProductSummary => item !== undefined),
      query.sort,
    )
    return { items, total: fused.length }
  }

  private async semanticIds(
    queryEmbedding: readonly number[] | null,
    limit: number,
  ): Promise<string[]> {
    if (!queryEmbedding || queryEmbedding.length === 0) return []
    let literal: string
    try {
      literal = vectorLiteral(queryEmbedding)
    } catch {
      return []
    }
    try {
      const rows = await this.db.$queryRaw<{ id: string }[]>`
        SELECT pe."productId" AS id
        FROM product_embeddings pe
        INNER JOIN products p ON p.id = pe."productId"
        WHERE p."isActive" = true
          AND pe.embedding IS NOT NULL
        ORDER BY pe.embedding <=> ${Prisma.raw(`'${literal}'::vector`)}
        LIMIT ${limit}
      `
      return rows.map((row) => row.id)
    } catch (error) {
      console.warn("[catalog] búsqueda semántica no disponible", error)
      return []
    }
  }

  async listFeatured(limit: number): Promise<readonly ProductSummary[]> {
    const rows = await this.db.product.findMany({
      where: { isActive: true, isFeatured: true },
      include: summaryInclude,
      orderBy: { name: "asc" },
      take: Math.min(Math.max(limit, 1), 24),
    })
    return rows.map(toSummary)
  }

  async listBrands(): Promise<readonly BrandRef[]> {
    const rows = await this.db.brand.findMany({
      where: { products: { some: { isActive: true } } },
      orderBy: { sortOrder: "asc" },
    })
    return rows.map((b) => ({
      slug: b.slug,
      name: b.name,
      color: b.color,
      accent: b.accent,
      logoUrl: b.logoUrl,
    }))
  }

  async listCategories(): Promise<readonly CategoryRef[]> {
    const rows = await this.db.category.findMany({
      where: { products: { some: { isActive: true } } },
      orderBy: { sortOrder: "asc" },
    })
    return rows.map((c) => ({ slug: c.slug, name: c.name }))
  }
}
