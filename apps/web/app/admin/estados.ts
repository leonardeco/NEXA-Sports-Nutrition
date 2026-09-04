import type { OrderStatus } from "@nexa/core"

/**
 * Cómo se nombra cada estado en el panel. Difiere de lo que ve el cliente:
 * al operador le importa qué tiene que hacer, no cómo suena.
 */
export const ESTADO_ADMIN: Record<OrderStatus, string> = {
  DRAFT: "Carrito abierto",
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagada",
  PREPARING: "En preparación",
  SHIPPED: "Enviada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
  PAYMENT_FAILED: "Pago fallido",
  EXPIRED: "Caducada",
  REFUNDED: "Reembolsada",
}
