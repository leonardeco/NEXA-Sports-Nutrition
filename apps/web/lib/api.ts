import { AdminProductError, CartError, OrderError, firstIssue } from "@nexa/core"
import {
  CartNotFoundError,
  CheckoutError,
  InsufficientStockError,
  InventoryError,
  OrderNotFoundError,
} from "@nexa/db"
import { NextResponse } from "next/server"
import type { z } from "zod"

/**
 * Traducción de errores de dominio a códigos HTTP.
 *
 * Se enumeran uno a uno a propósito: lo que no esté aquí es un fallo que no
 * habíamos previsto, y esos salen como 500 con un mensaje genérico en vez de
 * filtrarle al cliente el interior del sistema.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof InsufficientStockError) {
    return NextResponse.json(
      { error: "No queda suficiente stock de ese producto", available: error.available },
      { status: 409 },
    )
  }
  // Va despues de InsufficientStockError, que hereda de esta: el caso
  // concreto tiene que ganar al general. Aqui caen el resto de problemas de
  // inventario —una variante que dejo de existir entre anadirla al carrito
  // y pagar, por ejemplo—. No es un fallo nuestro, asi que 409 y no 500,
  // pero el mensaje interno lleva ids y no se le devuelve al cliente.
  if (error instanceof InventoryError) {
    console.error("[api] problema de inventario", error.message)
    return NextResponse.json(
      { error: "Ese producto ya no está disponible. Actualiza el carrito e inténtalo de nuevo." },
      { status: 409 },
    )
  }

  if (error instanceof CartNotFoundError || error instanceof OrderNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof CheckoutError || error instanceof CartError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof OrderError) {
    // Transición no permitida por la máquina de estados: el recurso está en
    // un estado que no admite lo que se pide, no es un error de sintaxis.
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof AdminProductError) {
    const status = error.message === "No encontrado" ? 404 : 409
    return NextResponse.json({ error: error.message }, { status })
  }

  console.error("[api] error no controlado", error)
  return NextResponse.json({ error: "Algo falló de nuestro lado. Inténtalo de nuevo." }, { status: 500 })
}

export function invalidRequest(error: z.ZodError): NextResponse {
  return NextResponse.json({ error: firstIssue(error) }, { status: 400 })
}

/**
 * 429 con `Retry-After` para que el cliente sepa cuándo reintentar en vez
 * de machacar. El mensaje ofrece WhatsApp: si frenamos a alguien que de
 * verdad quería comprar, no puede quedarse sin salida (RNF-03).
 */
export function tooManyRequests(message: string, retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: message, retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  )
}

/** Cuerpo JSON o null: un cuerpo ilegible no debe reventar el handler. */
export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null)
}
