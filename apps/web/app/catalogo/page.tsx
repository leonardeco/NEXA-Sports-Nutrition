import type { Metadata } from "next"
import Link from "next/link"
import { Money, type ProductQuery, type ProductSort } from "@nexa/core"
import { productRepository } from "@nexa/db"
import { PRICE_RANGES, SORT_OPTIONS } from "@/lib/config"
import { ProductCard } from "../components/product-card"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Catálogo",
  description:
    "Proteínas, creatinas, preentrenos y más suplementos deportivos de las mejores marcas.",
}

const PAGE_SIZE = 24

type SearchParams = Record<string, string | string[] | undefined>

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

/** Construye una URL de filtro conservando el resto de parámetros activos. */
function filterHref(current: SearchParams, changes: Record<string, string | undefined>): string {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(current)) {
    const value = Array.isArray(v) ? v[0] : v
    if (value) next.set(k, value)
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === "") next.delete(k)
    else next.set(k, v)
  }
  // Cambiar un filtro siempre devuelve a la primera página.
  if (!("pagina" in changes)) next.delete("pagina")
  const qs = next.toString()
  return qs ? `/catalogo?${qs}` : "/catalogo"
}

function isSort(value: string | undefined): value is ProductSort {
  return SORT_OPTIONS.some((o) => o.slug === value)
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const search = one(params, "q")
  const categoria = one(params, "categoria")
  const marca = one(params, "marca")
  const precioSlug = one(params, "precio") ?? "todos"
  const sortSlug = one(params, "orden")
  const pagina = Math.max(Number.parseInt(one(params, "pagina") ?? "1", 10) || 1, 1)

  const rango = PRICE_RANGES.find((r) => r.slug === precioSlug) ?? PRICE_RANGES[0]

  const query: ProductQuery = {
    ...(search ? { search } : {}),
    ...(categoria ? { category: categoria } : {}),
    ...(marca ? { brand: marca } : {}),
    ...(rango.min !== undefined ? { minPriceCents: Money.fromCents(rango.min) } : {}),
    ...(rango.max !== undefined ? { maxPriceCents: Money.fromCents(rango.max) } : {}),
    sort: isSort(sortSlug) ? sortSlug : "relevancia",
    limit: PAGE_SIZE,
    offset: (pagina - 1) * PAGE_SIZE,
  }

  const [{ items, total }, categorias, marcas] = await Promise.all([
    productRepository.search(query),
    productRepository.listCategories(),
    productRepository.listBrands(),
  ])

  const totalPaginas = Math.max(Math.ceil(total / PAGE_SIZE), 1)
  const hayFiltros = Boolean(search || categoria || marca || precioSlug !== "todos")

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-bold">Catálogo</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        {total} {total === 1 ? "producto" : "productos"}
        {hayFiltros ? " con los filtros activos" : " disponibles"}
      </p>

      {/* ── Búsqueda ───────────────────────────────────────────────── */}
      <form action="/catalogo" method="get" className="mt-6 flex gap-2">
        {categoria && <input type="hidden" name="categoria" value={categoria} />}
        {marca && <input type="hidden" name="marca" value={marca} />}
        <input
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Buscar proteina, creatina, preentreno…"
          aria-label="Buscar productos"
          className="flex-1 border px-3.5 py-2.5 text-sm outline-none"
          style={{
            borderColor: "var(--border-strong)",
            background: "var(--surface-raised)",
            color: "var(--text-primary)",
          }}
        />
        <button
          type="submit"
          className="px-5 py-2.5 text-sm font-semibold tracking-wide text-white uppercase"
          style={{ background: "var(--color-nexa-orange)" }}
        >
          Buscar
        </button>
      </form>

      <div className="mt-8 grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* ── Filtros ──────────────────────────────────────────────── */}
        <aside className="space-y-7">
          <FilterGroup title="Categoría">
            <FilterLink href={filterHref(params, { categoria: undefined })} active={!categoria}>
              Todas
            </FilterLink>
            {categorias.map((c) => (
              <FilterLink
                key={c.slug}
                href={filterHref(params, { categoria: c.slug })}
                active={categoria === c.slug}
              >
                {c.name}
              </FilterLink>
            ))}
          </FilterGroup>

          <FilterGroup title="Precio">
            {PRICE_RANGES.map((r) => (
              <FilterLink
                key={r.slug}
                href={filterHref(params, { precio: r.slug === "todos" ? undefined : r.slug })}
                active={precioSlug === r.slug}
              >
                {r.label}
              </FilterLink>
            ))}
          </FilterGroup>

          <FilterGroup title="Marca">
            <FilterLink href={filterHref(params, { marca: undefined })} active={!marca}>
              Todas
            </FilterLink>
            {marcas.map((m) => (
              <FilterLink
                key={m.slug}
                href={filterHref(params, { marca: m.slug })}
                active={marca === m.slug}
              >
                {m.name}
              </FilterLink>
            ))}
          </FilterGroup>
        </aside>

        {/* ── Resultados ───────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Ordenar por
            </span>
            {SORT_OPTIONS.map((o) => (
              <Link
                key={o.slug}
                href={filterHref(params, { orden: o.slug === "relevancia" ? undefined : o.slug })}
                className="border px-2.5 py-1 text-xs transition-colors"
                style={{
                  borderColor:
                    (sortSlug ?? "relevancia") === o.slug
                      ? "var(--color-nexa-orange)"
                      : "var(--border-subtle)",
                  color:
                    (sortSlug ?? "relevancia") === o.slug
                      ? "var(--color-nexa-orange)"
                      : "var(--text-secondary)",
                }}
              >
                {o.label}
              </Link>
            ))}
          </div>

          {items.length === 0 ? (
            <div
              className="border p-10 text-center"
              style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
            >
              <p className="font-semibold">No encontramos productos con esos filtros.</p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                Prueba con menos filtros o escribe solo el nombre del suplemento.
              </p>
              <Link
                href="/catalogo"
                className="mt-4 inline-block text-sm font-semibold"
                style={{ color: "var(--color-nexa-orange)" }}
              >
                Ver todo el catálogo
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          {totalPaginas > 1 && (
            <nav className="mt-8 flex items-center justify-between" aria-label="Paginación">
              {pagina > 1 ? (
                <Link
                  href={filterHref(params, { pagina: String(pagina - 1) })}
                  className="border px-4 py-2 text-sm"
                  style={{ borderColor: "var(--border-strong)" }}
                >
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                Página {pagina} de {totalPaginas}
              </span>
              {pagina < totalPaginas ? (
                <Link
                  href={filterHref(params, { pagina: String(pagina + 1) })}
                  className="border px-4 py-2 text-sm"
                  style={{ borderColor: "var(--border-strong)" }}
                >
                  Siguiente
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      </div>
    </main>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2
        className="text-[0.68rem] font-medium tracking-[0.16em] uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h2>
      <div className="mt-2.5 flex flex-col">{children}</div>
    </div>
  )
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className="border-l-2 py-1.5 pl-2.5 text-sm transition-colors"
      style={{
        borderColor: active ? "var(--color-nexa-orange)" : "transparent",
        color: active ? "var(--color-nexa-orange)" : "var(--text-secondary)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </Link>
  )
}
