"use client"

import { checkoutSchema, firstIssue } from "@nexa/core"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Datos de contacto y entrega. Valida con el MISMO esquema Zod que el Route
 * Handler —importado del dominio, no copiado— para que el cliente no pueda
 * aceptar algo que el servidor vaya a rechazar. La validación de aquí es
 * cortesía: la que cuenta es la del servidor.
 *
 * El formulario no envía ni un importe. El total se recalcula en el
 * checkout desde la base (RF-10).
 */
export function CheckoutForm({ blocked }: { blocked: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    const parsed = checkoutSchema.safeParse({
      fullName: form.get("fullName"),
      email: form.get("email"),
      phone: form.get("phone"),
      shippingCity: form.get("shippingCity"),
      shippingAddress: form.get("shippingAddress"),
      notes: (form.get("notes") as string) || undefined,
    })
    if (!parsed.success) {
      setError(firstIssue(parsed.error))
      return
    }

    setSending(true)
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      })
      const payload = (await response.json()) as {
        error?: string
        order?: { orderNumber: string }
      }

      if (!response.ok || !payload.order) {
        setError(payload.error ?? "No se pudo crear el pedido")
        setSending(false)
        return
      }
      router.push(`/orden/${payload.order.orderNumber}`)
      // El header vive en el layout raíz, que Next no vuelve a renderizar en
      // una navegación de cliente: sin esto la insignia seguiría mostrando
      // las unidades de un carrito que ya se convirtió en orden.
      router.refresh()
    } catch {
      setError("No hay conexión. Inténtalo de nuevo.")
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <h2 className="text-sm font-semibold tracking-[0.16em] uppercase">Datos de entrega</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field name="fullName" label="Nombre completo" autoComplete="name" />
        <Field name="phone" label="Teléfono" type="tel" autoComplete="tel" />
        <Field
          name="email"
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          className="sm:col-span-2"
        />
        <Field name="shippingCity" label="Ciudad" autoComplete="address-level2" />
        <Field name="shippingAddress" label="Dirección" autoComplete="street-address" />
        <Field
          name="notes"
          label="Indicaciones para la entrega (opcional)"
          required={false}
          className="sm:col-span-2"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 border px-4 py-3 text-sm"
          style={{ borderColor: "var(--color-nexa-warning)", color: "var(--color-nexa-warning)" }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending || blocked}
        className="mt-6 w-full px-6 py-4 text-sm font-semibold tracking-wide text-white uppercase transition-opacity disabled:opacity-50"
        style={{ background: "var(--color-nexa-orange)" }}
      >
        {sending ? "Creando el pedido…" : "Confirmar pedido"}
      </button>

      <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        Al confirmar reservamos tu stock durante 30 minutos. El pago en línea con Wompi
        llega en la siguiente fase; por ahora coordinamos el cobro por WhatsApp.
      </p>
    </form>
  )
}

function Field({
  name,
  label,
  type = "text",
  autoComplete,
  required = true,
  className = "",
}: {
  name: string
  label: string
  type?: string
  autoComplete?: string
  required?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="mt-1 w-full border bg-white px-3 py-2.5 text-sm"
        style={{ borderColor: "var(--border-subtle)" }}
      />
    </div>
  )
}
