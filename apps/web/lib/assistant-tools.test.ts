import { Money, type Cart, type ProductDetail, type ProductRepository } from "@nexa/core"
import { describe, expect, it } from "vitest"
import { executeTool, type ToolContext } from "./assistant-tools"

const product: ProductDetail = {
  id: "p1",
  slug: "nitro-tech-2-lbs",
  name: "Nitro Tech 2 LBS",
  badge: null,
  isFeatured: true,
  brand: { slug: "muscletech", name: "MuscleTech", color: null, accent: null, logoUrl: null },
  category: { slug: "proteinas", name: "Proteínas" },
  image: null,
  priceCents: Money.fromCOP(185_000),
  stock: 19,
  description: "Whey",
  benefits: null,
  usageInstructions: "1 scoop",
  images: [],
  variants: [
    {
      id: "v1",
      sku: "NT-2",
      name: "Única",
      priceCents: Money.fromCOP(185_000),
      stock: 19,
      isDefault: true,
    },
  ],
}

const emptyCart: Cart = {
  id: "c1",
  orderNumber: "NEXA-1",
  lines: [],
  subtotalCents: Money.zero(),
  shippingCents: Money.zero(),
  discountCents: Money.zero(),
  totalCents: Money.zero(),
  itemCount: 0,
  hasStockIssues: false,
}

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  const products = {
    findBySlug: async (slug: string) => (slug === product.slug ? product : null),
    findById: async () => product,
    findBySlugForAdmin: async (slug: string) => (slug === product.slug ? product : null),
    search: async () => ({ items: [product], total: 1 }),
    listForAdmin: async () => ({ items: [product], total: 1 }),
    listFeatured: async () => [],
    listBrands: async () => [],
    listCategories: async () => [],
    applyAdminProductChange: async () => product,
  } satisfies ProductRepository

  return {
    sessionId: "sess-1",
    products,
    carts: {
      find: async () => emptyCart,
      findOrCreate: async () => emptyCart,
      addItem: async () => ({
        cart: { ...emptyCart, itemCount: 1 },
        capped: false,
        available: 19,
      }),
      setItemQuantity: async () => ({ cart: emptyCart, capped: false, available: 19 }),
      removeItem: async () => emptyCart,
    },
    ...overrides,
  }
}

describe("executeTool", () => {
  it("buscar_productos solo devuelve precios que salieron del catálogo", async () => {
    const result = await executeTool("buscar_productos", { consulta: "nitro" }, ctx())
    const body = JSON.parse(result.content) as { productos: Array<{ precio: string; stock: number }> }
    expect(body.productos[0]?.precio).toBe(Money.format(Money.fromCOP(185_000)))
    expect(body.productos[0]?.stock).toBe(19)
    expect(result.content).not.toContain("18500000")
  })

  it("agregar_al_carrito exige confirmado: true", async () => {
    await expect(
      executeTool("agregar_al_carrito", { variantId: "v1", quantity: 1 }, ctx()),
    ).rejects.toThrow()
  })

  it("crear_enlace_pago no arma una orden si el carrito está vacío", async () => {
    const result = await executeTool("crear_enlace_pago", { confirmado: true }, ctx())
    expect(result.content).toMatch(/vacío/)
  })

  it("escalar_a_humano marca la conversación para un asesor", async () => {
    const result = await executeTool(
      "escalar_a_humano",
      { motivo: "Consulta sobre embarazo" },
      ctx(),
    )
    expect(result.escalate).toBe(true)
    expect(result.content).toMatch(/wa\.me/)
  })
})
