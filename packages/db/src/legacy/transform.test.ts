import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { Money } from "@nexa/core"
import {
  MigrationError,
  normalizeForSearch,
  slugify,
  toSku,
  transformCatalog,
  type LegacyProduct,
} from "./transform"

const legacyPath = fileURLToPath(
  new URL("../../prisma/seed-data/productos-legacy.json", import.meta.url),
)
const publicDir = fileURLToPath(new URL("../../../../apps/web/public", import.meta.url))

const legacy = JSON.parse(readFileSync(legacyPath, "utf8")) as LegacyProduct[]
const seed = transformCatalog(legacy)

describe("slugify", () => {
  it("quita acentos y normaliza", () => {
    expect(slugify("Proteínas")).toBe("proteinas")
    expect(slugify("Otros Suplementos")).toBe("otros-suplementos")
    expect(slugify("Nitro Tech 2 LBS")).toBe("nitro-tech-2-lbs")
  })

  it("no deja guiones sueltos en los extremos", () => {
    expect(slugify("  ¡Whey Gold!  ")).toBe("whey-gold")
  })
})

describe("normalizeForSearch", () => {
  it("permite que 'proteina' encuentre 'Proteínas'", () => {
    expect(normalizeForSearch("Proteínas")).toBe("proteinas")
    expect(normalizeForSearch("proteina")).toBe("proteina")
    expect(normalizeForSearch("Proteínas").startsWith(normalizeForSearch("proteina"))).toBe(true)
  })

  it("colapsa espacios y signos", () => {
    expect(normalizeForSearch("  Nitro-Tech,  2 LBS!  ")).toBe("nitro tech 2 lbs")
  })

  it("respeta acentos en otras palabras del catálogo", () => {
    expect(normalizeForSearch("Cafeína Platinum")).toBe("cafeina platinum")
  })
})

describe("toSku", () => {
  it("rellena a cuatro dígitos", () => {
    expect(toSku(1)).toBe("NX-0001")
    expect(toSku(127)).toBe("NX-0127")
  })
})

describe("migración del catálogo LEOFIT", () => {
  it("migra los 127 productos sin perder ninguno", () => {
    expect(legacy).toHaveLength(127)
    expect(seed.products).toHaveLength(127)
  })

  it("extrae las 4 categorías y las ordena", () => {
    expect(seed.categories.map((c) => c.name)).toEqual([
      "Proteínas",
      "Creatinas",
      "Preentrenos",
      "Otros Suplementos",
    ])
  })

  it("extrae las marcas que los productos usan de verdad", () => {
    const marcasEnDatos = new Set(legacy.map((p) => p.marca))
    expect(seed.brands).toHaveLength(marcasEnDatos.size)
    for (const b of seed.brands) expect(marcasEnDatos.has(b.name)).toBe(true)
  })

  it("genera slugs únicos", () => {
    const slugs = seed.products.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("genera SKU únicos", () => {
    const skus = seed.products.map((p) => p.variant.sku)
    expect(new Set(skus).size).toBe(skus.length)
  })

  it("convierte todos los precios a centavos enteros y positivos", () => {
    for (const p of seed.products) {
      expect(Number.isInteger(p.variant.priceCents)).toBe(true)
      expect(p.variant.priceCents).toBeGreaterThan(0)
    }
  })

  it("conserva el precio exacto del primer producto", () => {
    const nitroTech = seed.products.find((p) => p.legacyId === 1)
    expect(nitroTech?.name).toBe("Nitro Tech 2 LBS")
    expect(nitroTech?.variant.priceCents).toBe(Money.fromCOP(185_000))
    expect(Money.toCOP(nitroTech!.variant.priceCents)).toBe(185_000)
  })

  it("conserva el stock total del catálogo", () => {
    const stockLegacy = legacy.reduce((s, p) => s + (p.stock ?? 0), 0)
    const stockMigrado = seed.products.reduce((s, p) => s + p.variant.initialStock, 0)
    expect(stockMigrado).toBe(stockLegacy)
  })

  // Deuda D2: el front anterior inventaba "Punch" y "Vainilla" según la
  // categoría, sin saber si esos sabores existían.
  it("no inventa sabores: toda variante es Única", () => {
    const nombres = new Set(seed.products.map((p) => p.variant.name))
    expect([...nombres]).toEqual(["Única"])
  })

  it("todas las imágenes existen en el repositorio", () => {
    const faltantes = seed.products.filter((p) => !existsSync(publicDir + p.image.url))
    expect(faltantes.map((f) => f.image.url)).toEqual([])
  })

  it("cada imagen lleva texto alternativo con producto y marca", () => {
    for (const p of seed.products) {
      expect(p.image.alt).toContain(p.name)
      expect(p.image.alt.length).toBeGreaterThan(p.name.length)
    }
  })

  it("indexa nombre, marca y categoría en el texto de búsqueda", () => {
    for (const p of seed.products) {
      const original = legacy.find((l) => l.id === p.legacyId)!
      expect(p.searchText).toContain(normalizeForSearch(original.nombre))
      expect(p.searchText).toContain(normalizeForSearch(original.marca))
      expect(p.searchText).toContain(normalizeForSearch(original.categoria))
    }
  })

  it("una búsqueda sin acentos encuentra las proteínas", () => {
    const proteinas = seed.products.filter((p) => p.categorySlug === "proteinas")
    expect(proteinas.length).toBeGreaterThan(0)
    for (const p of proteinas) {
      expect(p.searchText).toContain("proteina")
    }
  })

  it("marca como destacados solo los que lo eran", () => {
    const destacadosLegacy = legacy.filter((p) => p.destacado === true).length
    expect(seed.products.filter((p) => p.isFeatured)).toHaveLength(destacadosLegacy)
  })
})

describe("validaciones de la migración", () => {
  const base: LegacyProduct = {
    id: 999,
    nombre: "Producto de prueba",
    marca: "MuscleTech",
    categoria: "Proteínas",
    precio: 100_000,
    descripcion: "Descripción",
    imagen: "/img/productos/1-nitro-tech-2-lbs.webp",
    badge: null,
    stock: 5,
    destacado: false,
  }

  it("rechaza un catálogo vacío", () => {
    expect(() => transformCatalog([])).toThrow(MigrationError)
  })

  it("rechaza ids duplicados", () => {
    expect(() => transformCatalog([base, { ...base }])).toThrow(/Id legacy duplicado/)
  })

  it("rechaza marcas desconocidas", () => {
    expect(() => transformCatalog([{ ...base, marca: "Marca Fantasma" }])).toThrow(/Marca desconocida/)
  })

  it("rechaza categorías desconocidas", () => {
    expect(() => transformCatalog([{ ...base, categoria: "Ropa" }])).toThrow(/Categoría desconocida/)
  })

  it("rechaza imágenes que no son webp", () => {
    expect(() => transformCatalog([{ ...base, imagen: "/img/productos/x.png" }])).toThrow(/no apunta a un \.webp/)
  })

  it("desempata slugs de nombres repetidos con el id legacy", () => {
    const result = transformCatalog([base, { ...base, id: 1000 }])
    expect(result.products.map((p) => p.slug)).toEqual([
      "producto-de-prueba",
      "producto-de-prueba-1000",
    ])
  })
})
