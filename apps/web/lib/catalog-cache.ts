// ─────────────────────────────────────────────────────────────────────────
//  Lecturas de catálogo con revalidación (RNF-01)
//
//  Prisma no pasa por el cache de `fetch`, así que sin esto cada visita a
//  portada o catálogo pega a Neon. `unstable_cache` guarda el resultado
//  dos minutos: bastante para el LCP, poco para que un cambio de precio
//  del panel se note al rato. El build de CI no necesita base de datos
//  porque estas funciones se evalúan en la petición, no al compilar.
// ─────────────────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache"
import type { ProductQuery } from "@nexa/core"
import { embedQuery, productRepository } from "@nexa/db"

export const CATALOG_REVALIDATE_SECONDS = 120

const cachedFeatured = unstable_cache(
  async (limit: number) => productRepository.listFeatured(limit),
  ["catalog-featured"],
  { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] },
)

const cachedCategories = unstable_cache(
  async () => productRepository.listCategories(),
  ["catalog-categories"],
  { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] },
)

const cachedBrands = unstable_cache(
  async () => productRepository.listBrands(),
  ["catalog-brands"],
  { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] },
)

export function getFeaturedProducts(limit: number) {
  return cachedFeatured(limit)
}

export function getCategories() {
  return cachedCategories()
}

export function getBrands() {
  return cachedBrands()
}

export function getProductSearch(query: ProductQuery) {
  return unstable_cache(
    async () => {
      const vector = query.search ? await embedQuery(query.search) : null
      return productRepository.search(query, vector)
    },
    ["catalog-search", JSON.stringify(query)],
    { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] },
  )()
}

export function getProductBySlug(slug: string) {
  return unstable_cache(
    async () => productRepository.findBySlug(slug),
    ["product", slug],
    { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] },
  )()
}
