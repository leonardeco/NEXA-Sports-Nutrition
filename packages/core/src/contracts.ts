// ─────────────────────────────────────────────────────────────────────────
//  Contratos de la API — ADS §6.4, constitución principio 4
//
//  Cada Route Handler valida su entrada contra uno de estos esquemas antes
//  de tocar nada. Viven en el dominio, no en la app, para que cliente y
//  servidor no puedan divergir: los dos importan el mismo objeto.
//
//  Los mensajes van en español porque llegan al cliente tal cual
//  (constitución, principio 8).
//
//  Nótese lo que NO está aquí: precios, totales ni importes de ningún tipo.
//  El cliente manda qué quiere y cuánto, jamás cuánto cuesta — eso se
//  recalcula siempre desde la base (principio 3).
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod"

/** Los cuid de Prisma; el tope generoso deja sitio a otro generador. */
const id = z.string().trim().min(1, "Falta el identificador").max(64)

/**
 * 999 no es una regla de negocio, es un tope de cordura: el límite real lo
 * pone el stock, que se comprueba en el servidor.
 */
const quantity = z
  .number({ invalid_type_error: "La cantidad debe ser un número" })
  .int("La cantidad debe ser un número entero")
  .max(999, "Esa cantidad supera lo que se puede pedir en línea")

export const addCartItemSchema = z.object({
  variantId: id,
  quantity: quantity.min(1, "Hay que añadir al menos una unidad"),
})

export const setCartItemSchema = z.object({
  /** Cero es válido: es la forma de vaciar la línea desde el carrito. */
  quantity: quantity.min(0, "La cantidad no puede ser negativa"),
})

export const checkoutSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Escribe tu nombre completo")
    .max(120, "Ese nombre es demasiado largo"),
  email: z
    .string()
    .trim()
    .min(1, "Necesitamos un correo para enviarte la confirmación")
    .email("Ese correo no parece válido")
    .max(160, "Ese correo es demasiado largo"),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{6,19}$/, "Escribe un teléfono de contacto válido"),
  shippingCity: z
    .string()
    .trim()
    .min(3, "Escribe la ciudad de entrega")
    .max(80, "Ese nombre de ciudad es demasiado largo"),
  shippingAddress: z
    .string()
    .trim()
    .min(6, "Escribe la dirección completa de entrega")
    .max(200, "Esa dirección es demasiado larga"),
  notes: z.string().trim().max(500, "Las indicaciones son demasiado largas").optional(),
})

export const orderStatusSchema = z.enum([
  "DRAFT",
  "PENDING_PAYMENT",
  "PAID",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "PAYMENT_FAILED",
  "EXPIRED",
  "REFUNDED",
])

export const changeOrderStatusSchema = z.object({
  status: orderStatusSchema,
})

export type AddCartItemInput = z.infer<typeof addCartItemSchema>
export type SetCartItemInput = z.infer<typeof setCartItemSchema>
export type CheckoutFormInput = z.infer<typeof checkoutSchema>
export type ChangeOrderStatusInput = z.infer<typeof changeOrderStatusSchema>

/**
 * Primer mensaje de error legible de un fallo de validación. Zod devuelve
 * el árbol entero; al cliente le sirve más una frase que un árbol.
 */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Los datos enviados no son válidos"
}
