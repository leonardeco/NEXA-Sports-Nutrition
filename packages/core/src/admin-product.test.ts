import { describe, expect, it } from "vitest"
import {
  BADGE_MAX_LENGTH,
  adjustmentDelta,
  changedAdminProductFields,
  normalizeBadge,
  pickEditableVariant,
  updateAdminProductSchema,
} from "./admin-product"
import { Money } from "./money"

describe("updateAdminProductSchema", () => {
  it("acepta pesos enteros, stock absoluto y activo", () => {
    expect(
      updateAdminProductSchema.parse({ priceCop: 185000, stock: 19, isActive: true }),
    ).toEqual({ priceCop: 185000, stock: 19, isActive: true })
  })

  it("rechaza un cuerpo vacío", () => {
    expect(updateAdminProductSchema.safeParse({}).success).toBe(false)
  })

  it("rechaza centavos colados y campos extra", () => {
    const parsed = updateAdminProductSchema.safeParse({
      priceCop: 1000,
      priceCents: 100000,
      stock: 1,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({ priceCop: 1000, stock: 1 })
      expect("priceCents" in parsed.data).toBe(false)
    }
  })

  it("rechaza stock negativo y pesos no enteros", () => {
    expect(updateAdminProductSchema.safeParse({ stock: -1 }).success).toBe(false)
    expect(updateAdminProductSchema.safeParse({ priceCop: 10.5 }).success).toBe(false)
  })

  it("acepta destacado e insignia", () => {
    expect(
      updateAdminProductSchema.parse({ isFeatured: true, badge: "Más vendido" }),
    ).toEqual({ isFeatured: true, badge: "Más vendido" })
  })

  it("convierte una insignia vacía en null, que es como se quita", () => {
    expect(updateAdminProductSchema.parse({ badge: "" })).toEqual({ badge: null })
    expect(updateAdminProductSchema.parse({ badge: "   " })).toEqual({ badge: null })
    expect(updateAdminProductSchema.parse({ badge: null })).toEqual({ badge: null })
  })

  it("rechaza una insignia más larga que la tarjeta", () => {
    const larga = "x".repeat(BADGE_MAX_LENGTH + 1)
    const parsed = updateAdminProductSchema.safeParse({ badge: larga })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain(String(BADGE_MAX_LENGTH))
    }
  })

  it("acepta una insignia justo en el límite", () => {
    const justa = "x".repeat(BADGE_MAX_LENGTH)
    expect(updateAdminProductSchema.parse({ badge: justa })).toEqual({ badge: justa })
  })

  it("rechaza una insignia que no es texto", () => {
    expect(updateAdminProductSchema.safeParse({ badge: 5 }).success).toBe(false)
  })
})

describe("normalizeBadge", () => {
  it("recorta y colapsa espacios", () => {
    expect(normalizeBadge("  Más   vendido  ")).toBe("Más vendido")
  })

  it("trata vacío y solo espacios como ausencia de insignia", () => {
    expect(normalizeBadge("")).toBeNull()
    expect(normalizeBadge("   ")).toBeNull()
    expect(normalizeBadge(null)).toBeNull()
  })
})

describe("adjustmentDelta", () => {
  it("es desired menos current", () => {
    expect(adjustmentDelta(19, 21)).toBe(2)
    expect(adjustmentDelta(19, 10)).toBe(-9)
    expect(adjustmentDelta(19, 19)).toBe(0)
  })

  it("lanza si el stock deseado es negativo", () => {
    expect(() => adjustmentDelta(5, -1)).toThrow(/no puede ser negativo/)
  })
})

describe("changedAdminProductFields", () => {
  const base = {
    priceCop: 185000,
    stock: 19,
    isActive: true,
    isFeatured: false,
    badge: "",
    initialPriceCop: 185000,
    initialStock: 19,
    initialActive: true,
    initialFeatured: false,
    initialBadge: null,
  }

  it("omite stock si solo cambia el precio", () => {
    const result = changedAdminProductFields({ ...base, priceCop: 190000 })
    expect(result).toEqual({ ok: true, data: { priceCop: 190000 } })
  })

  it("rechaza un envío sin cambios", () => {
    const result = changedAdminProductFields(base)
    expect(result.ok).toBe(false)
  })

  it("envía solo destacado cuando es lo único que cambia", () => {
    const result = changedAdminProductFields({ ...base, isFeatured: true })
    expect(result).toEqual({ ok: true, data: { isFeatured: true } })
  })

  it("envía solo la insignia cuando es lo único que cambia", () => {
    const result = changedAdminProductFields({ ...base, badge: "Nuevo" })
    expect(result).toEqual({ ok: true, data: { badge: "Nuevo" } })
  })

  it("envía null para quitar una insignia existente", () => {
    const result = changedAdminProductFields({
      ...base,
      badge: "",
      initialBadge: "Más vendido",
    })
    expect(result).toEqual({ ok: true, data: { badge: null } })
  })

  // Sin esto, abrir y guardar sin tocar nada mandaría un cambio de insignia.
  it("no cuenta como cambio un espacio de más en la insignia", () => {
    const result = changedAdminProductFields({
      ...base,
      badge: "  Más vendido  ",
      initialBadge: "Más vendido",
    })
    expect(result.ok).toBe(false)
  })

  it("agrupa varios cambios en un solo envío", () => {
    const result = changedAdminProductFields({
      ...base,
      priceCop: 190000,
      isFeatured: true,
      badge: "Oferta",
    })
    expect(result).toEqual({
      ok: true,
      data: { priceCop: 190000, isFeatured: true, badge: "Oferta" },
    })
  })

  it("propaga el error cuando la insignia es demasiado larga", () => {
    const result = changedAdminProductFields({
      ...base,
      badge: "x".repeat(BADGE_MAX_LENGTH + 1),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(String(BADGE_MAX_LENGTH))
  })
})

describe("pickEditableVariant", () => {
  const a = { id: "a", sku: "A", name: "A", priceCents: Money.fromCOP(1), stock: 1, isDefault: false }
  const b = { id: "b", sku: "B", name: "B", priceCents: Money.fromCOP(1), stock: 1, isDefault: true }

  it("elige isDefault y si no, la primera", () => {
    expect(pickEditableVariant([a, b])?.id).toBe("b")
    expect(pickEditableVariant([a])?.id).toBe("a")
  })

  it("devuelve null si no hay variantes", () => {
    expect(pickEditableVariant([])).toBeNull()
  })
})
