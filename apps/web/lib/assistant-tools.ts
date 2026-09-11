// ─────────────────────────────────────────────────────────────────────────
//  Ejecución de herramientas del asistente — ADR-0005
//
//  Cada herramienta habla con un puerto del dominio. El modelo nunca toca
//  la base: solo ve el JSON que sale de aquí, y los precios ya vienen
//  formateados desde packages/core.
// ─────────────────────────────────────────────────────────────────────────

import {
  Money,
  parseToolInput,
  productCardForTool,
  type CartRepository,
  type ProductRepository,
} from "@nexa/core"
import { whatsappLink } from "./config"

export interface ToolContext {
  readonly sessionId: string
  readonly products: ProductRepository
  readonly carts: CartRepository
}

export interface ToolResult {
  readonly content: string
  readonly escalate: boolean
  readonly cartChanged: boolean
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const input = parseToolInput(name, rawInput)

  switch (name) {
    case "buscar_productos": {
      const { consulta } = input as { consulta: string }
      const page = await ctx.products.search({ search: consulta, limit: 5 })
      return {
        content: json({
          total: page.total,
          productos: page.items.map(productCardForTool),
        }),
        escalate: false,
        cartChanged: false,
      }
    }
    case "obtener_producto": {
      const { slug } = input as { slug: string }
      const product = await ctx.products.findBySlug(slug)
      return {
        content: json(product ? productCardForTool(product) : { error: "No hay un producto con ese slug" }),
        escalate: false,
        cartChanged: false,
      }
    }
    case "comparar_productos": {
      const { slugs } = input as { slugs: string[] }
      const products = await Promise.all(slugs.map((slug) => ctx.products.findBySlug(slug)))
      return {
        content: json({
          productos: products.map((product, i) =>
            product ? productCardForTool(product) : { slug: slugs[i], error: "No encontrado" },
          ),
        }),
        escalate: false,
        cartChanged: false,
      }
    }
    case "agregar_al_carrito": {
      const { variantId, quantity } = input as { variantId: string; quantity: number }
      const { cart, capped, available } = await ctx.carts.addItem(ctx.sessionId, variantId, quantity)
      return {
        content: json({
          ok: true,
          capped,
          available,
          itemCount: cart.itemCount,
          total: Money.format(cart.totalCents),
          lineas: cart.lines.map((line) => ({
            nombre: line.productName,
            cantidad: line.quantity,
          })),
        }),
        escalate: false,
        cartChanged: true,
      }
    }
    case "crear_enlace_pago": {
      const cart = await ctx.carts.find(ctx.sessionId)
      if (!cart || cart.itemCount === 0) {
        return {
          content: json({ error: "El carrito está vacío. Añade un producto antes de pagar." }),
          escalate: false,
          cartChanged: false,
        }
      }
      return {
        content: json({
          url: "/carrito",
          itemCount: cart.itemCount,
          mensaje: "El cliente debe completar nombre, dirección y pago en /carrito. No inventes esos datos.",
        }),
        escalate: false,
        cartChanged: false,
      }
    }
    case "escalar_a_humano": {
      const { motivo } = input as { motivo: string }
      return {
        content: json({
          whatsapp: whatsappLink(`Hola, vengo del asesor de la tienda. ${motivo}`),
          mensaje: "Un asesor te atiende por WhatsApp.",
        }),
        escalate: true,
        cartChanged: false,
      }
    }
    default:
      return { content: json({ error: "Herramienta desconocida" }), escalate: false, cartChanged: false }
  }
}
