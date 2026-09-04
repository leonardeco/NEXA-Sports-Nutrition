"use client"

import { Money, type Cart } from "@nexa/core"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Edición de las líneas del carrito.
 *
 * No guarda copia del carrito en el cliente: cada cambio va al servidor y
 * luego se refresca la página, de modo que lo que se ve siempre es lo que
 * hay en la base. Con precios y stock de por medio, mantener dos versiones
 * de la verdad es cómo se acaba cobrando lo que no es.
 */
export function CartLines({ cart }: { cart: Cart }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(itemId: string, request: RequestInit & { method: string }) {
    setBusyId(itemId)
    setError(null)
    try {
      const response = await fetch(`/api/cart/items/${itemId}`, {
        headers: { "content-type": "application/json" },
        ...request,
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setError(payload.error ?? "No se pudo actualizar el carrito")
        return
      }
      router.refresh()
    } catch {
      setError("No hay conexión. Inténtalo de nuevo.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 border px-4 py-3 text-sm" style={alertStyle}>
          {error}
        </p>
      )}

      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {cart.lines.map((line) => {
          const excede = line.quantity > line.availableStock
          const tope = Math.max(Math.min(line.availableStock, 99), 1)

          return (
            <li key={line.id} className="flex gap-4 py-5">
              <div
                className="relative size-20 shrink-0 border bg-white"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt={line.productName}
                    fill
                    sizes="80px"
                    className="object-contain p-2"
                  />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/producto/${line.productSlug}`}
                  className="font-medium hover:underline"
                >
                  {line.productName}
                </Link>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {line.variantName} · {Money.format(line.unitPriceCents)} c/u
                </p>

                {excede && (
                  <p className="mt-1 text-xs" style={{ color: "var(--color-nexa-warning)" }}>
                    {line.availableStock === 0
                      ? "Se agotó. Quita esta línea para continuar."
                      : `Solo quedan ${line.availableStock}. Ajusta la cantidad para continuar.`}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-3">
                  <label className="sr-only" htmlFor={`cantidad-${line.id}`}>
                    Cantidad de {line.productName}
                  </label>
                  <select
                    id={`cantidad-${line.id}`}
                    value={Math.min(line.quantity, tope)}
                    disabled={busyId === line.id || line.availableStock === 0}
                    onChange={(event) =>
                      send(line.id, {
                        method: "PATCH",
                        body: JSON.stringify({ quantity: Number(event.target.value) }),
                      })
                    }
                    className="border bg-white px-2 py-1.5 text-sm tabular-nums"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    {Array.from({ length: tope }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={busyId === line.id}
                    onClick={() => send(line.id, { method: "DELETE" })}
                    className="text-xs underline disabled:opacity-50"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Quitar
                  </button>
                </div>
              </div>

              <p className="shrink-0 font-semibold tabular-nums">
                {Money.format(line.lineTotalCents)}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const alertStyle = {
  borderColor: "var(--color-nexa-warning)",
  color: "var(--color-nexa-warning)",
} as const
