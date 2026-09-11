"use client"

import { Money, firstIssue, updateAdminProductSchema, type ProductDetail } from "@nexa/core"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function AdminProductForm({ product }: { product: ProductDetail }) {
  const router = useRouter()
  const defaultVariant = product.variants.find((item) => item.isDefault) ?? product.variants[0]
  const [priceCop, setPriceCop] = useState(Money.toCOP(product.priceCents))
  const [stock, setStock] = useState(product.stock)
  const [isActive, setIsActive] = useState(product.isActive)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setOk(false)
    const parsed = updateAdminProductSchema.safeParse({ priceCop, stock, isActive })
    if (!parsed.success) {
      setError(firstIssue(parsed.error))
      return
    }
    setPending(true)
    try {
      const response = await fetch(`/api/admin/products/${product.slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(body.error ?? "No se pudo guardar")
        return
      }
      setOk(true)
      router.refresh()
    } catch {
      setError("No hay conexión. Inténtalo de nuevo.")
    } finally {
      setPending(false)
    }
  }

  if (!defaultVariant) {
    return <p className="text-sm">Este producto no tiene variante para editar.</p>
  }

  return (
    <form onSubmit={submit} className="mt-8 max-w-md space-y-5">
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-nexa-danger)" }}>
          {error}
        </p>
      )}
      {ok && (
        <p role="status" className="text-sm" style={{ color: "var(--color-nexa-success)" }}>
          Cambios guardados.
        </p>
      )}

      <div>
        <label htmlFor="priceCop" className="text-xs" style={{ color: "var(--text-muted)" }}>
          Precio (COP)
        </label>
        <input
          id="priceCop"
          name="priceCop"
          type="number"
          min={0}
          step={1}
          value={priceCop}
          onChange={(event) => setPriceCop(Number(event.target.value))}
          className="mt-1 w-full border bg-white px-3 py-2.5 text-sm tabular-nums"
          style={{ borderColor: "var(--border-subtle)" }}
        />
      </div>

      <div>
        <label htmlFor="stock" className="text-xs" style={{ color: "var(--text-muted)" }}>
          Stock disponible
        </label>
        <input
          id="stock"
          name="stock"
          type="number"
          min={0}
          step={1}
          value={stock}
          onChange={(event) => setStock(Number(event.target.value))}
          className="mt-1 w-full border bg-white px-3 py-2.5 text-sm tabular-nums"
          style={{ borderColor: "var(--border-subtle)" }}
        />
      </div>

      <div className="flex min-h-11 items-center gap-3">
        <input
          id="isActive"
          name="isActive"
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          className="size-5"
        />
        <label htmlFor="isActive" className="text-sm">
          Visible en el catálogo
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase disabled:opacity-50"
        style={{ background: "var(--color-nexa-orange)" }}
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  )
}
