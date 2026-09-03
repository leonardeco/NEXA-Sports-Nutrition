// ─────────────────────────────────────────────────────────────────────────
//  Carga del catálogo migrado desde LEOFIT — ADS §7.3
//
//  Idempotente: se puede correr las veces que haga falta. La lógica de
//  transformación vive en src/legacy/transform.ts y está cubierta por tests;
//  aquí solo hay entrada/salida.
//
//    pnpm db:seed
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { PrismaClient } from "../generated/client/index.js"
import { transformCatalog, type LegacyProduct } from "../src/legacy/transform"

const prisma = new PrismaClient()

const legacyPath = fileURLToPath(new URL("./seed-data/productos-legacy.json", import.meta.url))

async function main(): Promise<void> {
  const legacy = JSON.parse(readFileSync(legacyPath, "utf8")) as LegacyProduct[]
  const seed = transformCatalog(legacy)

  console.warn(
    `Migrando ${seed.products.length} productos, ${seed.brands.length} marcas y ${seed.categories.length} categorías`,
  )

  // ── Marcas y categorías ────────────────────────────────────────────────
  for (const b of seed.brands) {
    await prisma.brand.upsert({
      where: { slug: b.slug },
      create: b,
      update: { name: b.name, color: b.color, accent: b.accent, logoUrl: b.logoUrl, sortOrder: b.sortOrder },
    })
  }

  for (const c of seed.categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, sortOrder: c.sortOrder },
    })
  }

  const brandIds = new Map((await prisma.brand.findMany()).map((b) => [b.slug, b.id]))
  const categoryIds = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]))

  // ── Productos ──────────────────────────────────────────────────────────
  for (const p of seed.products) {
    const brandId = brandIds.get(p.brandSlug)
    const categoryId = categoryIds.get(p.categorySlug)
    if (!brandId || !categoryId) {
      throw new Error(`Faltan marca o categoría para ${p.slug}`)
    }

    const common = {
      name: p.name,
      description: p.description,
      benefits: p.benefits,
      usageInstructions: p.usageInstructions,
      badge: p.badge,
      isFeatured: p.isFeatured,
      searchText: p.searchText,
      brandId,
      categoryId,
    }

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, legacyId: p.legacyId, ...common },
      update: common,
    })

    const variant = await prisma.productVariant.upsert({
      where: { sku: p.variant.sku },
      create: {
        productId: product.id,
        sku: p.variant.sku,
        name: p.variant.name,
        priceCents: p.variant.priceCents,
        isDefault: true,
        stock: 0,
      },
      update: { priceCents: p.variant.priceCents, name: p.variant.name },
    })

    // El stock inicial entra como movimiento, no como columna: el
    // inventario es un libro (ADR-0004). Solo la primera vez.
    const yaTieneMovimientos = await prisma.inventoryMovement.count({
      where: { variantId: variant.id },
    })

    if (yaTieneMovimientos === 0 && p.variant.initialStock > 0) {
      await prisma.$transaction([
        prisma.inventoryMovement.create({
          data: {
            variantId: variant.id,
            delta: p.variant.initialStock,
            reason: "RESTOCK",
            note: "Stock inicial migrado desde LEOFIT",
          },
        }),
        prisma.productVariant.update({
          where: { id: variant.id },
          data: { stock: p.variant.initialStock },
        }),
      ])
    }

    const existing = await prisma.productImage.findFirst({
      where: { productId: product.id, url: p.image.url },
    })
    if (!existing) {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: p.image.url,
          alt: p.image.alt,
          isPrimary: true,
          sortOrder: 0,
        },
      })
    }
  }

  // ── Verificación: si no cuadra, el seed falla ──────────────────────────
  const [productos, variantes, imagenes, marcas, categorias, movimientos] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.productImage.count(),
    prisma.brand.count(),
    prisma.category.count(),
    prisma.inventoryMovement.aggregate({ _sum: { delta: true } }),
  ])

  const stockEsperado = seed.products.reduce((s, p) => s + p.variant.initialStock, 0)
  const stockReal = movimientos._sum.delta ?? 0

  const problemas: string[] = []
  if (productos !== seed.products.length) problemas.push(`productos: ${productos} ≠ ${seed.products.length}`)
  if (variantes !== seed.products.length) problemas.push(`variantes: ${variantes} ≠ ${seed.products.length}`)
  if (imagenes < seed.products.length) problemas.push(`imágenes: ${imagenes} < ${seed.products.length}`)
  if (marcas !== seed.brands.length) problemas.push(`marcas: ${marcas} ≠ ${seed.brands.length}`)
  if (categorias !== seed.categories.length) problemas.push(`categorías: ${categorias} ≠ ${seed.categories.length}`)
  if (stockReal !== stockEsperado) problemas.push(`stock: ${stockReal} ≠ ${stockEsperado}`)

  if (problemas.length > 0) {
    throw new Error(`La migración no cuadra:\n  ${problemas.join("\n  ")}`)
  }

  console.warn(
    `Listo: ${productos} productos · ${variantes} variantes · ${imagenes} imágenes · ` +
      `${marcas} marcas · ${categorias} categorías · ${stockReal} unidades en stock`,
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
