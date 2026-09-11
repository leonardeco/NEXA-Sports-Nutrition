import { describe, expect, it } from "vitest"
import { Money } from "./money"
import {
  ASSISTANT_MAX_USER_MESSAGES,
  ASSISTANT_SYSTEM_PROMPT,
  AssistantError,
  assertSessionAcceptsTurn,
  parseToolInput,
  productCardForTool,
  requiresHumanEscalation,
  sessionOverBudget,
} from "./assistant"
import type { ProductDetail } from "./ports"

const openSession = {
  messageCount: 0,
  tokenBudgetUsed: 0,
  endedAt: null,
  escalatedToHuman: false,
}

describe("requiresHumanEscalation", () => {
  it("deja pasar preguntas de catálogo", () => {
    expect(requiresHumanEscalation("¿Cuál whey es más barata?")).toBe(false)
    expect(requiresHumanEscalation("Quiero creatina micronizada 300 g")).toBe(false)
    expect(requiresHumanEscalation("Agrégame el Nitro Tech al carrito")).toBe(false)
  })

  it("escala consultas médicas, embarazo y menores (RF-19)", () => {
    expect(requiresHumanEscalation("Estoy embarazada, ¿puedo tomar termogénico?")).toBe(true)
    expect(requiresHumanEscalation("¿Interactúa con mis medicamentos para la presión?")).toBe(true)
    expect(requiresHumanEscalation("Se lo quiero dar a un menor de edad")).toBe(true)
    expect(requiresHumanEscalation("Tengo diabetes, qué proteína me recomiendas")).toBe(true)
    expect(requiresHumanEscalation("¿Cuál es la dosis clínica de creatina?")).toBe(true)
  })
})

describe("presupuesto de sesión", () => {
  it("acepta una sesión nueva", () => {
    expect(() => assertSessionAcceptsTurn(openSession)).not.toThrow()
    expect(sessionOverBudget(openSession)).toBe(false)
  })

  it("cierra al llegar al tope de mensajes (RF-21)", () => {
    const session = { ...openSession, messageCount: ASSISTANT_MAX_USER_MESSAGES }
    expect(sessionOverBudget(session)).toBe(true)
    expect(() => assertSessionAcceptsTurn(session)).toThrow(AssistantError)
  })

  it("no vuelve a hablar si ya se escaló a un humano", () => {
    expect(() =>
      assertSessionAcceptsTurn({ ...openSession, escalatedToHuman: true }),
    ).toThrow(/WhatsApp/)
  })
})

describe("parseToolInput", () => {
  it("exige confirmación explícita para agregar al carrito", () => {
    expect(() =>
      parseToolInput("agregar_al_carrito", { variantId: "var_1", quantity: 1 }),
    ).toThrow()
    expect(() =>
      parseToolInput("agregar_al_carrito", {
        variantId: "var_1",
        quantity: 1,
        confirmado: false,
      }),
    ).toThrow()
    expect(
      parseToolInput("agregar_al_carrito", {
        variantId: "var_1",
        quantity: 2,
        confirmado: true,
      }),
    ).toEqual({ variantId: "var_1", quantity: 2, confirmado: true })
  })

  it("rechaza una herramienta que no existe", () => {
    expect(() => parseToolInput("inventar_precio", {})).toThrow(AssistantError)
  })
})

describe("productCardForTool", () => {
  const product: ProductDetail = {
    id: "p1",
    slug: "nitro-tech-2-lbs",
    name: "Nitro Tech 2 LBS",
    badge: null,
    isFeatured: true,
    isActive: true,
    brand: { slug: "muscletech", name: "MuscleTech", color: null, accent: null, logoUrl: null },
    category: { slug: "proteinas", name: "Proteínas" },
    image: null,
    priceCents: Money.fromCOP(185_000),
    stock: 19,
    description: "Proteína",
    benefits: "Recuperación",
    usageInstructions: "Mezclar 1 scoop con 180 ml de agua.",
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

  it("entrega el precio formateado desde centavos, no un número suelto", () => {
    const card = productCardForTool(product)
    expect(card.precio).toBe(Money.format(Money.fromCOP(185_000)))
    expect(card.precio).toMatch(/185\.000/)
    expect(card.stock).toBe(19)
    expect(JSON.stringify(card)).not.toMatch(/18500000/)
  })
})

describe("prompt de sistema", () => {
  it("prohíbe inventar números y el consejo médico", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Nunca inventes un número/)
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/consejo médico/)
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/escalar_a_humano/)
  })
})
