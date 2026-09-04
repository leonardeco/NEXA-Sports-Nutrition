import { Money, nextStatuses } from "@nexa/core"
import { orderRepository } from "@nexa/db"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ESTADO_ADMIN } from "../../estados"
import { StatusActions } from "./status-actions"

export const dynamic = "force-dynamic"

type Params = Promise<{ orderNumber: string }>

/** RF-23 · detalle con cliente, ítems, importes y estado de la orden. */
export default async function AdminOrdenPage({ params }: { params: Params }) {
  const { orderNumber } = await params
  const order = await orderRepository.findByNumber(orderNumber)
  if (!order) notFound()

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/admin" className="text-xs underline" style={{ color: "var(--text-muted)" }}>
        Volver a órdenes
      </Link>

      <h1 className="mt-3 font-mono text-2xl font-bold">{order.orderNumber}</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        {ESTADO_ADMIN[order.status]}
        {order.expiresAt && order.status === "PENDING_PAYMENT" && (
          <> · reserva hasta {formatDateTime(order.expiresAt)}</>
        )}
      </p>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <Bloque titulo="Cliente">
          <p>{order.customerName ?? "Sin nombre"}</p>
          <p style={{ color: "var(--text-secondary)" }}>{order.email ?? "—"}</p>
          <p style={{ color: "var(--text-secondary)" }}>{order.phone ?? "—"}</p>
        </Bloque>

        <Bloque titulo="Entrega">
          <p>{order.shippingAddress ?? "—"}</p>
          <p style={{ color: "var(--text-secondary)" }}>{order.shippingCity ?? "—"}</p>
          {order.notes && (
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {order.notes}
            </p>
          )}
        </Bloque>
      </div>

      <section className="mt-8">
        <h2 className="text-xs font-medium tracking-[0.16em] uppercase" style={mutedStyle}>
          Ítems
        </h2>
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-4 py-3 text-sm">
              <span>
                {line.productName}
                <span style={mutedStyle}>
                  {" "}
                  · {line.variantName} × {line.quantity} a {Money.format(line.unitPriceCents)}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{Money.format(line.lineTotalCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 text-sm">
          <Row label="Subtotal">{Money.format(order.subtotalCents)}</Row>
          <Row label="Envío">{Money.format(order.shippingCents)}</Row>
          {order.discountCents > 0 && (
            <Row label="Descuento">−{Money.format(order.discountCents)}</Row>
          )}
        </dl>
        <div
          className="mt-3 flex justify-between border-t pt-3 font-semibold"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <span>Total</span>
          <span className="tabular-nums">{Money.format(order.totalCents)}</span>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium tracking-[0.16em] uppercase" style={mutedStyle}>
          Cambiar estado
        </h2>
        <StatusActions
          orderNumber={order.orderNumber}
          options={nextStatuses(order.status).map((status) => ({
            status,
            label: ESTADO_ADMIN[status],
          }))}
        />
      </section>
    </main>
  )
}

const mutedStyle = { color: "var(--text-muted)" } as const

function formatDateTime(date: Date): string {
  return date.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  })
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-medium tracking-[0.16em] uppercase" style={mutedStyle}>
        {titulo}
      </h2>
      <div className="mt-2 text-sm">{children}</div>
    </div>
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
