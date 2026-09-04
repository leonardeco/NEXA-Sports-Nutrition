"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

const INTERVAL_MS = 3_000
/** Dos minutos. Pasados, el webhook no va a llegar y manda la reconciliación. */
const MAX_ATTEMPTS = 40

/**
 * Consulta el estado de la orden hasta que deje de estar pendiente.
 *
 * Existe porque hay unos segundos entre que el cliente paga y el webhook
 * llega — la contrapartida conocida de no fiarse del redirect (ADR-0003).
 *
 * Se rinde a los dos minutos en vez de consultar para siempre: si a esas
 * alturas no llegó el webhook, lo resolverá el job de reconciliación y no
 * tiene sentido dejar una pestaña golpeando el servidor.
 */
export function PaymentPoller({ orderNumber }: { orderNumber: string }) {
  const router = useRouter()
  const [agotado, setAgotado] = useState(false)

  useEffect(() => {
    let attempts = 0
    let cancelled = false

    const id = setInterval(async () => {
      if (cancelled) return

      attempts += 1
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(id)
        setAgotado(true)
        return
      }

      try {
        const response = await fetch(`/api/orders/${orderNumber}`, { cache: "no-store" })
        if (!response.ok) return

        const { status } = (await response.json()) as { status: string }
        if (status !== "PENDING_PAYMENT") {
          clearInterval(id)
          router.refresh()
        }
      } catch {
        // Un fallo de red suelto no debe cortar la espera: se reintenta.
      }
    }, INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [orderNumber, router])

  if (!agotado) {
    return (
      <p className="sr-only" role="status">
        Esperando la confirmación del pago
      </p>
    )
  }

  return (
    <p
      role="status"
      className="mb-6 border px-4 py-3 text-sm"
      style={{ borderColor: "var(--color-nexa-warning)", color: "var(--color-nexa-warning)" }}
    >
      La confirmación está tardando más de lo normal. No cierres el pedido: si el cobro se
      hizo, lo detectamos y te avisamos. Escríbenos si prefieres verificarlo ahora.
    </p>
  )
}
