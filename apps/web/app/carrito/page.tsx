import type { Metadata } from "next"
import { Money } from "@nexa/core"
import { cartRepository } from "@nexa/db"
import Link from "next/link"
import { readSession } from "@/lib/session"
import { CartLines } from "./cart-lines"
import { CheckoutForm } from "./checkout-form"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Tu carrito",
  // Un carrito no tiene nada que hacer en un buscador.
  robots: { index: false, follow: false },
}

export default async function CarritoPage() {
  const sessionId = await readSession()
  const cart = sessionId ? await cartRepository.find(sessionId) : null

  if (!cart || cart.lines.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-5 py-16">
        <h1 className="text-3xl font-bold">Tu carrito está vacío</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          Todavía no has añadido nada. En el catálogo están las 127 referencias.
        </p>
        <Link
          href="/catalogo"
          className="mt-6 inline-block px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase"
          style={{ background: "var(--color-nexa-orange)" }}
        >
          Ver el catálogo
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-bold">Tu carrito</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <section aria-label="Productos en el carrito">
          <CartLines cart={cart} />
        </section>

        <aside>
          <div className="border p-5" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-sm font-semibold tracking-[0.16em] uppercase">Resumen</h2>

            <dl className="mt-4 space-y-2 text-sm">
              <Row label={`Subtotal (${cart.itemCount} unidades)`}>
                {Money.format(cart.subtotalCents)}
              </Row>
              <Row label="Envío">{Money.format(cart.shippingCents)}</Row>
              {cart.discountCents > 0 && (
                <Row label="Descuento">−{Money.format(cart.discountCents)}</Row>
              )}
            </dl>

            <div
              className="mt-4 flex items-baseline justify-between border-t pt-4"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <span className="font-semibold">Total</span>
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color: "var(--color-nexa-orange)" }}
              >
                {Money.format(cart.totalCents)}
              </span>
            </div>

            {cart.hasStockIssues && (
              <p
                role="alert"
                className="mt-4 border px-3 py-2 text-xs"
                style={{
                  borderColor: "var(--color-nexa-warning)",
                  color: "var(--color-nexa-warning)",
                }}
              >
                Alguna línea supera el stock disponible. Ajústala antes de confirmar.
              </p>
            )}
          </div>

          <CheckoutForm blocked={cart.hasStockIssues} />
        </aside>
      </div>
    </main>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt style={{ color: "var(--text-secondary)" }}>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  )
}
