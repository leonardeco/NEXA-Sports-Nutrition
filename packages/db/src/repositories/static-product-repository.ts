// ─────────────────────────────────────────────────────────────────────────
//  Catálogo desde el JSON del repo — como sports-store
//
//  LEOFIT servía 127 productos sin backend. Si Vercel no tiene DATABASE_URL,
//  esta implementación es la vitrina: mismos datos que el seed, marca NEXA,
//  precios vigentes. El carrito y el pago siguen exigiendo Neon.
// ─────────────────────────────────────────────────────────────────────────

import {
  type ProductDetail,
  type ProductPage,
  type ProductQuery,
  type ProductRepository,
  type ProductSummary,
  type Slug,
} from "@nexa/core"
import legacyJson from "../../prisma/seed-data/productos-legacy.json"
import { normalizeForSearch, transformCatalog, type LegacyProduct } from "../legacy/transform"

const seed = transformCatalog(legacyJson as LegacyProduct[])
const brandBySlug = new Map(seed.brands.map((b) => [b.slug, b]))
const categoryBySlug = new Map(seed.categories.map((c) => [c.slug, c]))

function detailOf(slug: string): ProductDetail | null {
  const product = seed.products.find((item) => item.slug === slug)
  if (!product) return null
  const brand = brandBySlug.get(product.brandSlug)
  const category = categoryBySlug.get(product.categorySlug)
  if (!brand || !category) return null
  const variantId = `static-${product.variant.sku}`
  const image = { url: product.image.url, alt: product.image.alt }
  return {
    id: `static-${product.legacyId}`,
    slug: product.slug,
    name: product.name,
    badge: product.badge,
    isFeatured: product.isFeatured,
    isActive: true,
    brand: { slug: brand.slug, name: brand.name, color: brand.color, accent: brand.accent, logoUrl: brand.logoUrl },
    category: { slug: category.slug, name: category.name },
    image,
    priceCents: product.variant.priceCents,
    stock: product.variant.initialStock,
    description: product.description,
    benefits: product.benefits,
    usageInstructions: product.usageInstructions,
    images: [image],
    variants: [
      {
        id: variantId,
        sku: product.variant.sku,
        name: product.variant.name,
        priceCents: product.variant.priceCents,
        stock: product.variant.initialStock,
        isDefault: true,
      },
    ],
  }
}

const allDetails: ProductDetail[] = seed.products
  .map((p) => detailOf(p.slug))
  .filter((item): item is ProductDetail => item !== null)

function toSummary(product: ProductDetail): ProductSummary {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    badge: product.badge,
    isFeatured: product.isFeatured,
    isActive: product.isActive,
    brand: product.brand,
    category: product.category,
    image: product.image,
    priceCents: product.priceCents,
    stock: product.stock,
  }
}

export class StaticProductRepository implements ProductRepository {
  async findBySlug(slug: Slug): Promise<ProductDetail | null> {
    return detailOf(slug)
  }

  async findById(id: string): Promise<ProductDetail | null> {
    return allDetails.find((item) => item.id === id) ?? null
  }

  async findBySlugForAdmin(slug: Slug): Promise<ProductDetail | null> {
    return this.findBySlug(slug)
  }

  async search(query: ProductQuery): Promise<ProductPage> {
    let items = allDetails.slice()
    if (query.onlyFeatured) items = items.filter((item) => item.isFeatured)
    if (query.brand) items = items.filter((item) => item.brand.slug === query.brand)
    if (query.category) items = items.filter((item) => item.category.slug === query.category)
    if (query.minPriceCents !== undefined) {
      items = items.filter((item) => item.priceCents >= query.minPriceCents!)
    }
    if (query.maxPriceCents !== undefined) {
      items = items.filter((item) => item.priceCents <= query.maxPriceCents!)
    }
    if (query.search) {
      const words = normalizeForSearch(query.search).split(" ").filter(Boolean)
      items = items.filter((item) => {
        const haystack = normalizeForSearch(`${item.name} ${item.brand.name} ${item.category.name} ${item.description ?? ""}`)
        return words.every((word) => haystack.includes(word))
      })
    }
    if (query.sort === "precio-asc") items.sort((a, b) => a.priceCents - b.priceCents)
    else if (query.sort === "precio-desc") items.sort((a, b) => b.priceCents - a.priceCents)
    else if (query.sort === "nombre") items.sort((a, b) => a.name.localeCompare(b.name, "es"))
    else items.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.name.localeCompare(b.name, "es"))

    const total = items.length
    const take = Math.min(Math.max(query.limit ?? 24, 1), 100)
    const skip = Math.max(query.offset ?? 0, 0)
    return { items: items.slice(skip, skip + take).map(toSummary), total }
  }

  async listForAdmin(query: ProductQuery): Promise<ProductPage> {
    return this.search(query)
  }

  async listFeatured(limit: number): Promise<readonly ProductSummary[]> {
    const page = await this.search({ onlyFeatured: true, limit, sort: "relevancia" })
    return page.items
  }

  async listBrands() {
    return seed.brands.map((b) => ({
      slug: b.slug,
      name: b.name,
      color: b.color,
      accent: b.accent,
      logoUrl: b.logoUrl,
    }))
  }

  async listCategories() {
    return seed.categories.map((c) => ({ slug: c.slug, name: c.name }))
  }

  async applyAdminProductChange(): Promise<ProductDetail> {
    throw new Error("El panel de productos necesita DATABASE_URL")
  }
}

export const staticCatalogSize = allDetails.length
