"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

type Feedback = { kind: "ok" | "warn" | "error"; text: string }

/**
 * Añadir al carrito desde la ficha de producto (RF-05).
 *
 * El selector se limita al stock que había al renderizar, pero eso es solo
 * cortesía visual: quien manda es el servidor, que puede recortar la
 * cantidad si alguien compró primero. Cuando lo hace responde `capped` y
 * aquí se dice con todas las letras en vez de añadir menos en silencio
 * (RF-06).
 */
export function AddToCart({
  variantId,
  stock,
  disabled,
}: {
  variantId: string
  stock: number
  disabled?: boolean
}) {
  const router = useRouter()
  const [quantity, setQuantity] = useState(1)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pending, startTransition] = useTransition()

  const max = Math.max(Math.min(stock, 99), 1)

  async function add() {
    setFeedback(null)
    try {
      const response = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId, quantity }),
      })
      const payload = (await response.json()) as {
        error?: string
        capped?: boolean
        available?: number
      }

      if (!response.ok) {
        setFeedback({ kind: "error", text: payload.error ?? "No se pudo añadir al carrito" })
        return
      }
      if (payload.capped) {
        setFeedback({
          kind: "warn",
          text:
            payload.available === 0
              ? "Se agotó mientras lo mirabas. No quedan unidades."
              : `Solo quedan ${payload.available}. Añadimos esa cantidad.`,
        })
      } else {
        setFeedback({ kind: "ok", text: "Añadido al carrito." })
      }
      // Refresca la insignia del header con la cuenta nueva.
      startTransition(() => router.refresh())
    } catch {
      setFeedback({ kind: "error", text: "No hay conexión. Inténtalo de nuevo." })
    }
  }

  if (disabled) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Sin unidades disponibles por ahora.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-stretch gap-3">
        <label className="sr-only" htmlFor="cantidad">
          Cantidad
        </label>
        <select
          id="cantidad"
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
          className="border bg-white px-3 py-3 text-sm tabular-nums"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase transition-opacity disabled:opacity-60"
          style={{ background: "var(--color-nexa-orange)" }}
        >
          {pending ? "Añadiendo…" : "Añadir al carrito"}
        </button>
      </div>

      {feedback && (
        <p
          role="status"
          className="mt-3 text-sm"
          style={{
            color:
              feedback.kind === "error"
                ? "var(--color-nexa-danger, #b42318)"
                : feedback.kind === "warn"
                  ? "var(--color-nexa-warning)"
                  : "var(--color-nexa-success)",
          }}
        >
          {feedback.text}{" "}
          {feedback.kind !== "error" && (
            <Link href="/carrito" className="font-semibold underline">
              Ver carrito
            </Link>
          )}
        </p>
      )}
    </div>
  )
}
