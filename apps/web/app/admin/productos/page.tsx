import { Money } from "@nexa/core"
import { productRepository } from "@nexa/db"
import Link from "next/link"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 25

type Search = Promise<{ pagina?: string }>

/**
 * RF-22 · listado del catálogo para el panel: incluye inactivos, ordenados
 * por nombre. El estado se lee del producto, no se infiere por el precio.
 */
export default async function AdminProductosPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const pagina = Math.max(Number(params.pagina ?? 1) || 1, 1)
  const { items, total } = await productRepository.listForAdmin({
    limit: PAGE_SIZE,
    offset: (pagina - 1) * PAGE_SIZE,
  })
  const paginas = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-2xl font-bold">Productos</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        {total} {total === 1 ? "producto" : "productos"}
      </p>

      {items.length === 0 ? (
        <p className="mt-10 text-sm" style={{ color: "var(--text-muted)" }}>
          No hay productos.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm" aria-label="Productos del catálogo">
            <thead>
              <tr
                className="border-b text-xs tracking-wide uppercase"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
              >
                <th className="py-2 pr-4 font-medium">Producto</th>
                <th className="py-2 pr-4 font-medium">Marca</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 pr-4 text-right font-medium">Stock</th>
                <th className="py-2 text-right font-medium">Precio</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {items.map((product) => (
                <tr
                  key={product.id}
                  style={product.isActive ? undefined : { color: "var(--text-muted)" }}
                >
                  <td className="py-3 pr-4">
                    <Link href={`/admin/productos/${product.slug}`} className="hover:underline">
                      {product.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4" style={{ color: "var(--text-secondary)" }}>
                    {product.brand.name}
                  </td>
                  <td className="py-3 pr-4">
                    {!product.isActive ? "Oculto" : product.stock <= 0 ? "Agotado" : "Visible"}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">{product.stock}</td>
                  <td
                    className="py-3 text-right font-semibold tabular-nums"
                  >
                    {Money.format(product.priceCents)}
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
            <Link href={`/admin/productos?pagina=${pagina - 1}`} className="underline">
              Anterior
            </Link>
          )}
          <span style={{ color: "var(--text-muted)" }}>
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link href={`/admin/productos?pagina=${pagina + 1}`} className="underline">
              Siguiente
            </Link>
          )}
        </nav>
      )}
    </main>
  )
}
