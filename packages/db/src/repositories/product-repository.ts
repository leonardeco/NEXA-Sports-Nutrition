// ─────────────────────────────────────────────────────────────────────────
//  Adaptador Prisma del puerto ProductRepository — ADR-0001
//  El dominio declara la interfaz; aquí vive la única implementación que
//  sabe de SQL. Si mañana el catálogo se sirve desde otro sitio, se cambia
//  este archivo y nada más.
// ─────────────────────────────────────────────────────────────────────────

import {
  Money,
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
import type { Prisma, PrismaClient } from "../../generated/client/index.js"
import { normalizeForSearch } from "../legacy/transform"

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

  async search(query: ProductQuery): Promise<ProductPage> {
    const where = buildWhere(query)
    const take = Math.min(Math.max(query.limit ?? 24, 1), 100)
    const skip = Math.max(query.offset ?? 0, 0)

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

    let items = rows.map(toSummary)
    if (query.sort === "precio-asc") {
      items = [...items].sort((a, b) => a.priceCents - b.priceCents)
    } else if (query.sort === "precio-desc") {
      items = [...items].sort((a, b) => b.priceCents - a.priceCents)
    }

    return { items, total }
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
