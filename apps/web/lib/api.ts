import { CartError, OrderError, firstIssue } from "@nexa/core"
import {
  CartNotFoundError,
  CheckoutError,
  InsufficientStockError,
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

  console.error("[api] error no controlado", error)
  return NextResponse.json({ error: "Algo falló de nuestro lado. Inténtalo de nuevo." }, { status: 500 })
}

export function invalidRequest(error: z.ZodError): NextResponse {
  return NextResponse.json({ error: firstIssue(error) }, { status: 400 })
}

/** Cuerpo JSON o null: un cuerpo ilegible no debe reventar el handler. */
export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null)
}
