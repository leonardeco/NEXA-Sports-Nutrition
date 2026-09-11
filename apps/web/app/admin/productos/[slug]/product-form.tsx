"use client"

import { Money, changedAdminProductFields, type ProductDetail } from "@nexa/core"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function AdminProductForm({ product }: { product: ProductDetail }) {
  const router = useRouter()
  const defaultVariant = product.variants.find((item) => item.isDefault) ?? product.variants[0]
  const initialPriceCop = Money.toCOP(product.priceCents)
  const initialStock = defaultVariant?.stock ?? product.stock
  const [priceCop, setPriceCop] = useState(String(initialPriceCop))
  const [stock, setStock] = useState(String(initialStock))
  const [isActive, setIsActive] = useState(product.isActive)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setOk(false)

    const nextPrice = priceCop.trim() === "" ? Number.NaN : Number(priceCop)
    const nextStock = stock.trim() === "" ? Number.NaN : Number(stock)
    const parsed = changedAdminProductFields({
      priceCop: nextPrice,
      stock: nextStock,
      isActive,
      initialPriceCop,
      initialStock,
      initialActive: product.isActive,
    })
    if (!parsed.ok) {
      setError(parsed.error)
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
    <form onSubmit={submit} className="mt-8 max-w-md space-y-5" aria-busy={pending}>
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
        <label htmlFor="priceCop" className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Precio (COP)
        </label>
        <input
          id="priceCop"
          name="priceCop"
          type="number"
          min={0}
          step={1}
          value={priceCop}
          onChange={(event) => setPriceCop(event.target.value)}
          className="mt-1 w-full border px-3 py-2.5 text-sm tabular-nums"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)", color: "var(--text-primary)" }}
        />
      </div>

      <div>
        <label htmlFor="stock" className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Stock disponible
        </label>
        <input
          id="stock"
          name="stock"
          type="number"
          min={0}
          step={1}
          value={stock}
          onChange={(event) => setStock(event.target.value)}
          className="mt-1 w-full border px-3 py-2.5 text-sm tabular-nums"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)", color: "var(--text-primary)" }}
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
        style={{ background: "var(--color-nexa-navy-deep)" }}
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  )
}
