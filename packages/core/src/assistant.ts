// ─────────────────────────────────────────────────────────────────────────
//  Asistente de ventas — ADR-0005, RF-17 a RF-21
//
//  El modelo no ve la base de datos: ve resultados de herramientas. Este
//  archivo define las reglas que no dependen de Anthropic: barandas médicas,
//  presupuesto de sesión, esquemas de las herramientas y el formato con el
//  que se les entrega un producto. El adaptador (apps/web) es quien habla
//  con el modelo y quien ejecuta las herramientas contra los repositorios.
//
//  Constitución, principio 6: precio, stock, nombre y disponibilidad solo
//  salen de un resultado de herramienta. El bot no da consejo médico.
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod"
import { Money } from "./money"
import type { ProductDetail, ProductSummary } from "./ports"

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly code: "budget" | "escalated" | "closed" | "tool",
  ) {
    super(message)
    this.name = "AssistantError"
  }
}

/** Tope de mensajes de usuario por sesión (RF-21). */
export const ASSISTANT_MAX_USER_MESSAGES = 20

/** Tope de tokens de salida+entrada acumulados por sesión (RF-21). */
export const ASSISTANT_TOKEN_BUDGET = 40_000

export const ASSISTANT_DISCLAIMER =
  "Orientación comercial, no consejo médico. Los suplementos no reemplazan una alimentación equilibrada ni un criterio profesional."

export const ASSISTANT_SYSTEM_PROMPT = `Eres el asesor de ventas de NEXA Sports Nutrition, una tienda colombiana de suplementos deportivos. Hablas español de Colombia, breve y directo.

Reglas que no se negocian:
- Precio, stock, nombre comercial y disponibilidad SOLO salen de un resultado de herramienta. Si no lo tienes, llama a la herramienta. Nunca inventes un número.
- No das consejo médico, dosificación clínica, interacciones con medicamentos, ni recomendaciones para embarazo, lactancia, menores de edad, ni enfermedades. En esos casos llamas a escalar_a_humano.
- El modo de uso impreso en la etiqueta se puede citar tal cual viene de obtener_producto. No lo interpretes ni lo ajustes.
- agregar_al_carrito solo se llama cuando el cliente confirma con claridad ("sí, agrégalo", "métemelo al carrito"). Sin esa confirmación, preguntas primero.
- crear_enlace_pago no inventa datos de envío: lleva al carrito para que el cliente los escriba.
- Si no sabes algo del catálogo, lo dices y ofreces WhatsApp.

Eres vendedor, no médico. ${ASSISTANT_DISCLAIMER}`

export interface AssistantBudget {
  readonly messageCount: number
  readonly tokenBudgetUsed: number
  readonly endedAt: Date | null
  readonly escalatedToHuman: boolean
}

export function sessionIsOpen(session: AssistantBudget): boolean {
  return session.endedAt === null && !session.escalatedToHuman
}

export function sessionOverBudget(session: AssistantBudget): boolean {
  return (
    session.messageCount >= ASSISTANT_MAX_USER_MESSAGES ||
    session.tokenBudgetUsed >= ASSISTANT_TOKEN_BUDGET
  )
}

export function assertSessionAcceptsTurn(session: AssistantBudget): void {
  if (session.escalatedToHuman) {
    throw new AssistantError(
      "Esta conversación la sigue un asesor por WhatsApp. Escríbenos ahí y te atendemos.",
      "escalated",
    )
  }
  if (session.endedAt !== null || sessionOverBudget(session)) {
    throw new AssistantError(
      "Llegamos al límite de esta conversación. Si quieres seguir, un asesor te atiende por WhatsApp.",
      "budget",
    )
  }
}

/**
 * RF-19 · consultas que el bot no puede responder. Se evalúa sobre el
 * mensaje del cliente, antes de gastar un turno del modelo.
 */
const MEDICAL_PATTERN =
  /\b(embaraz|gestaci[oó]n|lactancia|amantamiento|menor(?:es)? de edad|niñ[oa]s?\b|pediatric|pediátric|medicament|f[aá]rmaco|interacci[oó]n(?:es)? con|dosis cl[ií]nic|dosificaci[oó]n cl[ií]nic|enfermedad|patolog[ií]a|diagn[oó]stic|diabetes|hipertens|tensi[oó]n arterial|presi[oó]n arterial|ri[nñ][oó]n|renal|h[ií]gado|hep[aá]tic|insuficiencia|quimioterapia|c[aá]ncer|anabol|esteroide|receta m[eé]dica)\w*/i

export function requiresHumanEscalation(text: string): boolean {
  return MEDICAL_PATTERN.test(text)
}

export const TOOL_NAMES = [
  "buscar_productos",
  "obtener_producto",
  "comparar_productos",
  "agregar_al_carrito",
  "crear_enlace_pago",
  "escalar_a_humano",
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

export const searchProductsInputSchema = z.object({
  consulta: z.string().trim().min(2).max(120),
})

export const getProductInputSchema = z.object({
  slug: z.string().trim().min(1).max(160),
})

export const compareProductsInputSchema = z.object({
  slugs: z.array(z.string().trim().min(1).max(160)).min(2).max(3),
})

export const addToCartInputSchema = z.object({
  variantId: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(99).default(1),
  confirmado: z.literal(true),
})

export const createPaymentLinkInputSchema = z.object({
  confirmado: z.literal(true),
})

export const escalateInputSchema = z.object({
  motivo: z.string().trim().min(3).max(280),
})

export const chatTurnSchema = z.object({
  message: z
    .string({ invalid_type_error: "Escribe un mensaje" })
    .trim()
    .min(1, "Escribe un mensaje")
    .max(2000, "Ese mensaje es demasiado largo"),
})

export function parseToolInput(name: string, raw: unknown): unknown {
  switch (name) {
    case "buscar_productos":
      return searchProductsInputSchema.parse(raw)
    case "obtener_producto":
      return getProductInputSchema.parse(raw)
    case "comparar_productos":
      return compareProductsInputSchema.parse(raw)
    case "agregar_al_carrito":
      return addToCartInputSchema.parse(raw)
    case "crear_enlace_pago":
      return createPaymentLinkInputSchema.parse(raw)
    case "escalar_a_humano":
      return escalateInputSchema.parse(raw)
    default:
      throw new AssistantError(`La herramienta ${name} no existe`, "tool")
  }
}

/** Lo que el modelo puede ver de un producto: números ya resueltos desde la base. */
export function productCardForTool(product: ProductDetail | ProductSummary): Record<string, unknown> {
  const stock = product.stock
  const card: Record<string, unknown> = {
    slug: product.slug,
    nombre: product.name,
    marca: product.brand.name,
    categoria: product.category.name,
    precio: Money.format(product.priceCents),
    stock,
    disponible: stock > 0,
    agotado: stock <= 0,
  }

  if ("variants" in product) {
    card.descripcion = product.description
    card.beneficios = product.benefits
    card.modo_uso_etiqueta = product.usageInstructions
    card.variantes = product.variants.map((v) => ({
      variantId: v.id,
      nombre: v.name,
      sku: v.sku,
      precio: Money.format(v.priceCents),
      stock: v.stock,
      disponible: v.stock > 0,
    }))
  }

  return card
}

export const ASSISTANT_TOOL_DEFINITIONS = [
  {
    name: "buscar_productos",
    description:
      "Busca productos reales del catálogo NEXA por texto (nombre, marca, categoría). Devuelve precio y stock actuales.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Lo que el cliente está buscando, en español" },
      },
      required: ["consulta"],
    },
  },
  {
    name: "obtener_producto",
    description: "Ficha completa de un producto por slug, con precio, stock y variantes de ahora mismo.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "comparar_productos",
    description: "Compara 2 o 3 productos por slug: precio, stock y datos de etiqueta.",
    input_schema: {
      type: "object",
      properties: {
        slugs: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
      },
      required: ["slugs"],
    },
  },
  {
    name: "agregar_al_carrito",
    description:
      "Añade una variante al carrito del cliente. Solo después de una confirmación explícita. confirmado debe ser true.",
    input_schema: {
      type: "object",
      properties: {
        variantId: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 99 },
        confirmado: { type: "boolean" },
      },
      required: ["variantId", "confirmado"],
    },
  },
  {
    name: "crear_enlace_pago",
    description:
      "Devuelve el enlace del carrito para que el cliente complete el pago. No inventa datos de envío. confirmado debe ser true.",
    input_schema: {
      type: "object",
      properties: { confirmado: { type: "boolean" } },
      required: ["confirmado"],
    },
  },
  {
    name: "escalar_a_humano",
    description: "Cierra el chat y entrega el WhatsApp de un asesor. Obligatorio en consultas médicas.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
    },
  },
] as const
