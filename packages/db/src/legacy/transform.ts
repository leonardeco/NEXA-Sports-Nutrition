// ─────────────────────────────────────────────────────────────────────────
//  Migración del catálogo de LEOFIT — ADS §7.3
//
//  Transformación pura: entra `productos.json`, salen las filas que el seed
//  escribirá. Sin I/O y sin Prisma, para poder verificar los 127 productos
//  con tests en lugar de descubrir los errores contra la base.
//
//  Dos decisiones deliberadas:
//  · Cada producto recibe una sola variante `Única`. NO se replica la
//    invención de sabores del front anterior, que asignaba "Punch" a los
//    preentrenos y "Vainilla" al resto sin saber si existían (deuda D2).
//  · El stock entra como movimiento RESTOCK, no como columna suelta: el
//    inventario es un libro de movimientos (ADR-0004).
// ─────────────────────────────────────────────────────────────────────────

import { Money, type Cents } from "@nexa/core"

export interface LegacyProduct {
  id: number
  nombre: string
  marca: string
  categoria: string
  precio: number
  descripcion: string
  imagen: string
  badge: string | null
  stock: number
  destacado: boolean
  beneficios?: string
  modo_uso?: string
}

export interface BrandSeed {
  slug: string
  name: string
  color: string | null
  accent: string | null
  logoUrl: string | null
  sortOrder: number
}

export interface CategorySeed {
  slug: string
  name: string
  sortOrder: number
}

export interface ProductSeed {
  slug: string
  legacyId: number
  name: string
  brandSlug: string
  categorySlug: string
  description: string
  benefits: string | null
  usageInstructions: string | null
  badge: string | null
  isFeatured: boolean
  searchText: string
  variant: {
    sku: string
    name: string
    priceCents: Cents
    initialStock: number
  }
  image: {
    url: string
    alt: string
  }
}

export interface CatalogSeed {
  brands: BrandSeed[]
  categories: CategorySeed[]
  products: ProductSeed[]
}

// ── Datos de marca ───────────────────────────────────────────────────────
// Los colores son de las marcas reales, no de la tienda: sirven para los
// distintivos del catálogo. Solo se referencian logos que existen en
// apps/web/public/img/marcas.
const BRAND_META: Record<string, { color: string; accent: string; order: number; logo: string | null }> = {
  MuscleTech: { color: "#7B2FF2", accent: "#FFFFFF", order: 1, logo: "/img/marcas/muscletech.webp" },
  Dymatize: { color: "#003087", accent: "#FFFFFF", order: 2, logo: null },
  "Optimum Nutrition": { color: "#1A1A1A", accent: "#E5C100", order: 3, logo: "/img/marcas/optimum-nutrition.svg" },
  BSN: { color: "#8B0000", accent: "#FFFFFF", order: 4, logo: "/img/marcas/bsn.svg" },
  Cellucor: { color: "#0047AB", accent: "#AAFF00", order: 5, logo: "/img/marcas/cellucor.webp" },
  Basic: { color: "#1A3A1A", accent: "#AAFF00", order: 6, logo: null },
  Simply: { color: "#7B3F00", accent: "#FFFFFF", order: 7, logo: null },
  Isopure: { color: "#006400", accent: "#FFFFFF", order: 8, logo: "/img/marcas/isopure.svg" },
  "Sascha Fitness": { color: "#1A1A2E", accent: "#FF6B00", order: 9, logo: null },
  Proscience: { color: "#0D1B2A", accent: "#00E5FF", order: 10, logo: null },
  Nutreamerican: { color: "#1A0A2E", accent: "#FF6B35", order: 11, logo: null },
  "Ronnie Coleman": { color: "#1A1A1A", accent: "#FFD700", order: 12, logo: "/img/marcas/ronnie-coleman.webp" },
  "Angry Supplements": { color: "#1A0000", accent: "#FF4444", order: 13, logo: "/img/marcas/angry-supplements.webp" },
  "Graz Chemical": { color: "#2F4F4F", accent: "#00FFFF", order: 14, logo: null },
  Varios: { color: "#1E1E1E", accent: "#FF6B00", order: 15, logo: null },
}

// Sin color propio: las categorías se pintan con la paleta NEXA, no con la
// de la tienda anterior.
const CATEGORY_ORDER: Record<string, number> = {
  Proteínas: 1,
  Creatinas: 2,
  Preentrenos: 3,
  "Otros Suplementos": 4,
}

/** Quita los acentos combinantes que deja `normalize("NFD")`. */
const COMBINING_MARKS = /[̀-ͯ]/g

/** "Proteínas Whey 2 LBS" → "proteinas-whey-2-lbs" */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Texto normalizado para búsqueda: minúsculas, sin acentos y con los
 * espacios colapsados. Se aplica igual al contenido y a lo que escribe el
 * cliente, de modo que "proteina" encuentra "Proteínas".
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Referencia estable e imprimible: el id legacy con relleno. */
export function toSku(legacyId: number): string {
  return `NX-${String(legacyId).padStart(4, "0")}`
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MigrationError"
  }
}

export function transformCatalog(legacy: readonly LegacyProduct[]): CatalogSeed {
  if (legacy.length === 0) {
    throw new MigrationError("El archivo legacy no tiene productos")
  }

  const brandNames = new Set<string>()
  const categoryNames = new Set<string>()
  const usedSlugs = new Set<string>()
  const seenIds = new Set<number>()

  const products: ProductSeed[] = legacy.map((item) => {
    if (seenIds.has(item.id)) {
      throw new MigrationError(`Id legacy duplicado: ${item.id}`)
    }
    seenIds.add(item.id)

    if (!BRAND_META[item.marca]) {
      throw new MigrationError(`Marca desconocida en el producto ${item.id}: "${item.marca}"`)
    }
    if (CATEGORY_ORDER[item.categoria] === undefined) {
      throw new MigrationError(`Categoría desconocida en el producto ${item.id}: "${item.categoria}"`)
    }
    if (!item.imagen?.endsWith(".webp")) {
      throw new MigrationError(`El producto ${item.id} no apunta a un .webp: "${item.imagen}"`)
    }

    brandNames.add(item.marca)
    categoryNames.add(item.categoria)

    // Si dos productos comparten nombre, el id legacy desempata.
    let slug = slugify(item.nombre)
    if (usedSlugs.has(slug)) slug = `${slug}-${item.id}`
    usedSlugs.add(slug)

    return {
      slug,
      legacyId: item.id,
      name: item.nombre,
      brandSlug: slugify(item.marca),
      categorySlug: slugify(item.categoria),
      description: item.descripcion,
      benefits: item.beneficios ?? null,
      usageInstructions: item.modo_uso ?? null,
      badge: item.badge ?? null,
      isFeatured: item.destacado === true,
      searchText: normalizeForSearch(
        [item.nombre, item.marca, item.categoria, item.descripcion].join(" "),
      ),
      variant: {
        sku: toSku(item.id),
        name: "Única",
        priceCents: Money.fromCOP(item.precio),
        initialStock: Math.max(0, Math.trunc(item.stock ?? 0)),
      },
      image: {
        url: item.imagen,
        alt: `${item.nombre} — ${item.marca}`,
      },
    }
  })

  const brands: BrandSeed[] = [...brandNames]
    .map((name) => {
      const meta = BRAND_META[name]!
      return {
        slug: slugify(name),
        name,
        color: meta.color,
        accent: meta.accent,
        logoUrl: meta.logo,
        sortOrder: meta.order,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const categories: CategorySeed[] = [...categoryNames]
    .map((name) => ({
      slug: slugify(name),
      name,
      sortOrder: CATEGORY_ORDER[name]!,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return { brands, categories, products }
}
