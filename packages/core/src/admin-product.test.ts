import { describe, expect, it } from "vitest"
import { adjustmentDelta, pickEditableVariant, updateAdminProductSchema } from "./admin-product"
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
