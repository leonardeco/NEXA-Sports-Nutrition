import { z } from "zod"

export class AdminProductError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdminProductError"
  }
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
  })
  .refine((value) => value.priceCop !== undefined || value.stock !== undefined || value.isActive !== undefined, {
    message: "No hay ningún cambio que guardar",
  })

export type UpdateAdminProductInput = z.infer<typeof updateAdminProductSchema>

export function adjustmentDelta(current: number, desired: number): number {
  if (!Number.isInteger(current) || !Number.isInteger(desired)) {
    throw new AdminProductError("El stock debe ser un entero")
  }
  if (desired < 0) {
    throw new AdminProductError("El stock no puede ser negativo")
  }
  return desired - current
}
