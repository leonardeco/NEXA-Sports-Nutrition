"use client"

import type { OrderStatus } from "@nexa/core"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Botones de transición. Las opciones vienen calculadas por la máquina de
 * estados del dominio, así que aquí no se decide nada: si un estado no se
 * puede alcanzar, su botón no existe. El servidor lo vuelve a comprobar de
 * todos modos — un botón oculto no es una restricción.
 */
export function StatusActions({
  orderNumber,
  options,
}: {
  orderNumber: string
  options: readonly { status: OrderStatus; label: string }[]
}) {
  const router = useRouter()
  const [pending, setPending] = useState<OrderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (options.length === 0) {
    return (
      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
        Esta orden ya está cerrada. No admite más cambios.
      </p>
    )
  }

  async function change(status: OrderStatus) {
    setPending(status)
    setError(null)
    try {
      const response = await fetch(`/api/admin/orders/${orderNumber}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setError(payload.error ?? "No se pudo cambiar el estado")
        return
      }
      router.refresh()
    } catch {
      setError("No hay conexión. Inténtalo de nuevo.")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {options.map(({ status, label }) => (
          <button
            key={status}
            type="button"
            disabled={pending !== null}
            onClick={() => change(status)}
            className="border px-4 py-2 text-sm disabled:opacity-50"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {pending === status ? "Cambiando…" : label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: "var(--color-nexa-warning)" }}>
          {error}
        </p>
      )}
    </div>
  )
}
