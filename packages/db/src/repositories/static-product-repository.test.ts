import { Money } from "@nexa/core"
import { describe, expect, it } from "vitest"
import legacyJson from "../../prisma/seed-data/productos-legacy.json"
import { StaticProductRepository, staticCatalogSize } from "./static-product-repository"

const repo = new StaticProductRepository()
// La misma fuente que lee el repositorio: si el JSON crece, el test crece con él.
const catalogSize = (legacyJson as unknown[]).length

describe("StaticProductRepository", () => {
  it("carga el catálogo NEXA del JSON (como sports-store, sin Postgres)", async () => {
    expect(catalogSize).toBeGreaterThanOrEqual(127)
    expect(staticCatalogSize).toBe(catalogSize)
    const page = await repo.search({ limit: 24, offset: 0 })
    expect(page.total).toBe(catalogSize)
    expect(page.items.length).toBe(24)
  })

  it("sirve una ficha con el precio actualizado del listado NEXA", async () => {
    const product = await repo.findBySlug("nitro-tech-whey-gold-2-lbs")
    expect(product?.name).toBe("Nitro Tech Whey Gold 2 LBS")
    expect(product?.priceCents).toBe(Money.fromCOP(185_000))
    expect(product?.brand.name).toBe("MuscleTech")
  })

  it("filtra por categoría", async () => {
    const page = await repo.search({ category: "proteinas", limit: 100 })
    expect(page.total).toBeGreaterThan(10)
    expect(page.items.every((item) => item.category.slug === "proteinas")).toBe(true)
  })
})
