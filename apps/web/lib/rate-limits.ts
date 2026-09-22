import { createRateLimiter } from "./rate-limit"

// ─────────────────────────────────────────────────────────────────────────
//  Presupuestos por ruta, en un solo sitio para poder compararlos.
//
//  Están calibrados para que un cliente real nunca los toque: quien compra
//  hace un checkout, no ocho. El margen cubre reintentos tras un error de
//  validación y a varias personas tras la misma IP —el wifi de un gimnasio,
//  una oficina—, que comparten clave.
// ─────────────────────────────────────────────────────────────────────────

/**
 * El más estricto de los tres: cada llamada reserva stock durante 30
 * minutos y el cron que libera lo vencido corre una vez al día.
 */
export const checkoutLimiter = createRateLimiter({ limit: 8, windowMs: 10 * 60_000 })

/** Añadir, cambiar cantidad y quitar líneas. Generoso: se toca mucho. */
export const cartWriteLimiter = createRateLimiter({ limit: 40, windowMs: 60_000 })

/** Cada turno cuesta tokens de verdad (ADR-0005). */
export const chatLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 })
