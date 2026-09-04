import { describe, expect, it } from "vitest"
import {
  CartError,
  buildCart,
  resolveQuantity,
  shippingFor,
  toCartLine,
  type CartLineDraft,
  type ShippingPolicy,
} from "./cart"
import { Money } from "./money"

/** Tarifa plana nacional acordada para v1: $12.000. */
const FLAT_RATE: ShippingPolicy = { flatRateCents: Money.fromCOP(12_000) }

/** Precio real de Nitro Tech 2 LBS en el catálogo migrado. */
const NITRO_TECH = Money.fromCOP(185_000)

function line(overrides: Partial<CartLineDraft> = {}): CartLineDraft {
  return {
    id: "item_1",
    variantId: "var_1",
    productSlug: "nitro-tech-2-lbs",
    productName: "Nitro Tech",
    variantName: "Única",
    imageUrl: null,
    unitPriceCents: NITRO_TECH,
    quantity: 1,
    availableStock: 10,
    ...overrides,
  }
}

describe("resolveQuantity", () => {
  it("deja pasar la cantidad cuando hay stock de sobra", () => {
    expect(resolveQuantity(3, 10)).toEqual({ quantity: 3, capped: false, available: 10 })
  })

  it("permite pedir exactamente el stock disponible sin marcar recorte", () => {
    expect(resolveQuantity(10, 10)).toEqual({ quantity: 10, capped: false, available: 10 })
  })

  it("recorta al stock disponible e informa del recorte (RF-06)", () => {
    expect(resolveQuantity(12, 4)).toEqual({ quantity: 4, capped: true, available: 4 })
  })

  it("devuelve cero cuando el producto está agotado, sin lanzar", () => {
    expect(resolveQuantity(2, 0)).toEqual({ quantity: 0, capped: true, available: 0 })
  })

  it("trata el stock negativo como agotado", () => {
    // El caché de product_variants.stock podría desincronizarse (ADR-0004);
    // un negativo no debe convertirse en una cantidad negativa en la orden.
    expect(resolveQuantity(2, -5)).toEqual({ quantity: 0, capped: true, available: 0 })
  })

  it("acepta pedir cero", () => {
    expect(resolveQuantity(0, 10)).toEqual({ quantity: 0, capped: false, available: 10 })
  })

  it("rechaza cantidades negativas o fraccionarias", () => {
    expect(() => resolveQuantity(-1, 10)).toThrow(CartError)
    expect(() => resolveQuantity(1.5, 10)).toThrow(CartError)
  })
})

describe("shippingFor", () => {
  it("cobra la tarifa plana con cualquier cantidad de ítems", () => {
    expect(shippingFor(1, FLAT_RATE)).toBe(FLAT_RATE.flatRateCents)
    expect(shippingFor(9, FLAT_RATE)).toBe(FLAT_RATE.flatRateCents)
  })

  it("no cobra envío sobre un carrito vacío", () => {
    expect(shippingFor(0, FLAT_RATE)).toBe(0)
  })
})

describe("toCartLine", () => {
  it("multiplica precio por cantidad", () => {
    expect(toCartLine(line({ quantity: 3 })).lineTotalCents).toBe(Money.fromCOP(555_000))
  })
})

describe("buildCart", () => {
  const base = { id: "ord_1", orderNumber: "NEXA-260903-K7F2QX", shipping: FLAT_RATE }

  it("suma subtotal, envío y total", () => {
    const cart = buildCart({ ...base, lines: [line({ quantity: 2 })] })

    expect(cart.subtotalCents).toBe(Money.fromCOP(370_000))
    expect(cart.shippingCents).toBe(Money.fromCOP(12_000))
    expect(cart.totalCents).toBe(Money.fromCOP(382_000))
    expect(cart.itemCount).toBe(2)
  })

  it("cuenta unidades y no líneas en itemCount", () => {
    const cart = buildCart({
      ...base,
      lines: [line({ quantity: 2 }), line({ id: "item_2", variantId: "var_2", quantity: 3 })],
    })

    expect(cart.itemCount).toBe(5)
    expect(cart.lines).toHaveLength(2)
  })

  it("deja un carrito vacío en cero, sin cobrar envío", () => {
    const cart = buildCart({ ...base, lines: [] })

    expect(cart.subtotalCents).toBe(0)
    expect(cart.shippingCents).toBe(0)
    expect(cart.totalCents).toBe(0)
    expect(cart.itemCount).toBe(0)
    expect(cart.hasStockIssues).toBe(false)
  })

  it("recalcula el total con el precio vivo, no con el guardado", () => {
    // El precio subió mientras el carrito estaba abierto: manda el nuevo.
    const cart = buildCart({
      ...base,
      lines: [line({ quantity: 1, unitPriceCents: Money.fromCOP(199_000) })],
    })

    expect(cart.subtotalCents).toBe(Money.fromCOP(199_000))
  })

  it("marca el carrito cuando una línea excede el stock actual", () => {
    const cart = buildCart({ ...base, lines: [line({ quantity: 5, availableStock: 2 })] })

    expect(cart.hasStockIssues).toBe(true)
  })

  it("no marca problemas cuando la cantidad iguala al stock", () => {
    const cart = buildCart({ ...base, lines: [line({ quantity: 2, availableStock: 2 })] })

    expect(cart.hasStockIssues).toBe(false)
  })

  it("aplica el descuento sobre el subtotal", () => {
    const cart = buildCart({
      ...base,
      lines: [line({ quantity: 1 })],
      discountCents: Money.fromCOP(15_000),
    })

    expect(cart.discountCents).toBe(Money.fromCOP(15_000))
    expect(cart.totalCents).toBe(Money.fromCOP(182_000))
  })

  it("no deja que el descuento supere el subtotal ni se coma el envío", () => {
    const cart = buildCart({
      ...base,
      lines: [line({ quantity: 1 })],
      discountCents: Money.fromCOP(999_000),
    })

    expect(cart.discountCents).toBe(Money.fromCOP(185_000))
    expect(cart.totalCents).toBe(Money.fromCOP(12_000))
  })

  it("ignora un descuento negativo", () => {
    const cart = buildCart({
      ...base,
      lines: [line({ quantity: 1 })],
      discountCents: Money.fromCents(-5_000),
    })

    expect(cart.discountCents).toBe(0)
    expect(cart.totalCents).toBe(Money.fromCOP(197_000))
  })
})
