import { z } from "zod"
import type { VariantSummary } from "./ports"

export class AdminProductError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdminProductError"
  }
}

/**
 * La insignia se pinta como una etiqueta pequeña sobre la foto del producto.
 * Más de esto se sale de la tarjeta en móvil.
 */
export const BADGE_MAX_LENGTH = 24

/** Texto vacío o solo espacios significa "sin insignia", no cadena vacía. */
export function normalizeBadge(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim().replace(/\s+/g, " ")
  return trimmed.length === 0 ? null : trimmed
}

export const updateAdminProductSchema = z
  .object({
    priceCop: z
      .number({ invalid_type_error: "El precio debe ser un número" })
      .int("El precio debe ser pesos enteros")
      .min(0, "El precio no puede ser negativo")
      .max(21_474_836, "Ese precio supera el máximo que se puede guardar")
      .optional(),
    stock: z
      .number({ invalid_type_error: "El stock debe ser un número" })
      .int("El stock debe ser un entero")
      .min(0, "El stock no puede ser negativo")
      .optional(),
    isActive: z.boolean({ invalid_type_error: "El estado debe ser sí o no" }).optional(),
    isFeatured: z.boolean({ invalid_type_error: "Destacado debe ser sí o no" }).optional(),
    badge: z
      .string({ invalid_type_error: "La insignia debe ser texto" })
      .trim()
      .max(BADGE_MAX_LENGTH, `La insignia no puede pasar de ${BADGE_MAX_LENGTH} caracteres`)
      .nullable()
      .transform((value) => normalizeBadge(value))
      .optional(),
  })
  .refine(
    (value) =>
      value.priceCop !== undefined ||
      value.stock !== undefined ||
      value.isActive !== undefined ||
      value.isFeatured !== undefined ||
      value.badge !== undefined,
    { message: "No hay ningún cambio que guardar" },
  )

export type UpdateAdminProductInput = z.infer<typeof updateAdminProductSchema>

/** Only fields the operator actually changed. Omitting stock avoids restoring a reservation. */
export function changedAdminProductFields(input: {
  readonly priceCop: number
  readonly stock: number
  readonly isActive: boolean
  readonly isFeatured: boolean
  readonly badge: string | null
  readonly initialPriceCop: number
  readonly initialStock: number
  readonly initialActive: boolean
  readonly initialFeatured: boolean
  readonly initialBadge: string | null
}): { ok: true; data: UpdateAdminProductInput } | { ok: false; error: string } {
  const patch: {
    priceCop?: number
    stock?: number
    isActive?: boolean
    isFeatured?: boolean
    badge?: string | null
  } = {}
  if (input.priceCop !== input.initialPriceCop) patch.priceCop = input.priceCop
  if (input.stock !== input.initialStock) patch.stock = input.stock
  if (input.isActive !== input.initialActive) patch.isActive = input.isActive
  if (input.isFeatured !== input.initialFeatured) patch.isFeatured = input.isFeatured

  const nextBadge = normalizeBadge(input.badge)
  if (nextBadge !== normalizeBadge(input.initialBadge)) patch.badge = nextBadge

  const parsed = updateAdminProductSchema.safeParse(patch)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos" }
  }
  return { ok: true, data: parsed.data }
}

export function adjustmentDelta(current: number, desired: number): number {
  if (!Number.isInteger(current) || !Number.isInteger(desired)) {
    throw new AdminProductError("El stock debe ser un entero")
  }
  if (desired < 0) {
    throw new AdminProductError("El stock no puede ser negativo")
  }
  return desired - current
}

export function pickEditableVariant(
  variants: readonly VariantSummary[],
): VariantSummary | null {
  if (variants.length === 0) return null
  return variants.find((item) => item.isDefault) ?? variants[0] ?? null
}
