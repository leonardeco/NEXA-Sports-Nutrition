import { Money, orderStatusSchema, type OrderStatus } from "@nexa/core"
import { orderRepository } from "@nexa/db"
import Link from "next/link"
import { ESTADO_ADMIN } from "./estados"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 25

type Search = Promise<{ estado?: string; pagina?: string }>

/**
 * RF-23 · listado de órdenes con estado, cliente e importe. Los carritos
 * abandonados no salen: el repositorio excluye DRAFT salvo que se pida.
 */
export default async function AdminOrdenesPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const estado = orderStatusSchema.safeParse(params.estado)
  const pagina = Math.max(Number(params.pagina ?? 1) || 1, 1)

  const { items, total } = await orderRepository.list({
    status: estado.success ? estado.data : undefined,
    limit: PAGE_SIZE,
    offset: (pagina - 1) * PAGE_SIZE,
  })
  const paginas = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-2xl font-bold">Órdenes</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        {total} {total === 1 ? "orden" : "órdenes"}
      </p>

      <nav className="mt-5 flex flex-wrap gap-2 text-xs" aria-label="Filtrar por estado">
        <Filtro activo={!estado.success} href="/admin">
          Todas
        </Filtro>
        {FILTROS.map((status) => (
          <Filtro
            key={status}
            activo={estado.success && estado.data === status}
            href={`/admin?estado=${status}`}
          >
            {ESTADO_ADMIN[status]}
          </Filtro>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="mt-10 text-sm" style={{ color: "var(--text-muted)" }}>
          No hay órdenes con ese filtro.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs tracking-wide uppercase"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
              >
                <th className="py-2 pr-4 font-medium">Orden</th>
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 pr-4 font-medium">Cliente</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 pr-4 text-right font-medium">Unidades</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {items.map((order) => (
                <tr key={order.id}>
                  <td className="py-3 pr-4">
                    <Link
                      href={`/admin/ordenes/${order.orderNumber}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="py-3 pr-4">{order.customerName ?? "—"}</td>
                  <td className="py-3 pr-4">
                    <EstadoChip status={order.status} expiresAt={order.expiresAt} />
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">{order.itemCount}</td>
                  <td className="py-3 text-right font-semibold tabular-nums">
                    {Money.format(order.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <nav className="mt-6 flex gap-2 text-sm" aria-label="Paginación">
          {pagina > 1 && (
            <Link href={paginaHref(params.estado, pagina - 1)} className="underline">
              Anterior
            </Link>
          )}
          <span style={{ color: "var(--text-muted)" }}>
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link href={paginaHref(params.estado, pagina + 1)} className="underline">
              Siguiente
            </Link>
          )}
        </nav>
      )}
    </main>
  )
}

const FILTROS: readonly OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "EXPIRED",
  "CANCELLED",
]

function paginaHref(estado: string | undefined, pagina: number): string {
  const query = new URLSearchParams()
  if (estado) query.set("estado", estado)
  query.set("pagina", String(pagina))
  return `/admin?${query}`
}

function formatDate(date: Date): string {
  return date.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  })
}

function Filtro({
  href,
  activo,
  children,
}: {
  href: string
  activo: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="border px-3 py-1.5"
      style={{
        borderColor: activo ? "var(--color-nexa-orange)" : "var(--border-subtle)",
        color: activo ? "var(--color-nexa-orange)" : "var(--text-secondary)",
      }}
    >
      {children}
    </Link>
  )
}

/** Una orden pendiente cuyo plazo ya pasó espera al cron: se marca aparte. */
function EstadoChip({ status, expiresAt }: { status: OrderStatus; expiresAt: Date | null }) {
  const vencida = status === "PENDING_PAYMENT" && expiresAt !== null && expiresAt <= new Date()

  return (
    <span className="whitespace-nowrap">
      {ESTADO_ADMIN[status]}
      {vencida && (
        <span className="ml-1 text-xs" style={{ color: "var(--color-nexa-warning)" }}>
          · plazo vencido
        </span>
      )}
    </span>
  )
}
