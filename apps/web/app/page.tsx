import Link from "next/link"
import { productRepository } from "@nexa/db"
import { STORE, whatsappLink } from "@/lib/config"
import { HexBackdrop } from "./components/hex-backdrop"
import { ProductCard } from "./components/product-card"

// El catálogo se sirve desde la base en cada petición. En F5 pasa a ISR con
// revalidación, cuando ya se midan los tiempos reales (RNF-01).
export const dynamic = "force-dynamic"

export default async function Home() {
  const [destacados, categorias, marcas] = await Promise.all([
    productRepository.listFeatured(8),
    productRepository.listCategories(),
    productRepository.listBrands(),
  ])

  return (
    <main>
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[var(--color-nexa-navy-deep)]">
        <HexBackdrop />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <p
            className="font-mono text-[0.7rem] tracking-[0.22em] uppercase"
            style={{ color: "var(--color-nexa-orange)" }}
          >
            {STORE.city}
          </p>
          <h1 className="mt-3 max-w-[14ch] text-5xl leading-[0.92] font-bold text-white sm:text-7xl">
            {STORE.tagline}
          </h1>
          <p className="mt-5 max-w-[52ch] text-white/70">{STORE.description}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/catalogo"
              className="px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase transition-colors"
              style={{ background: "var(--color-nexa-orange)" }}
            >
              Ver catálogo
            </Link>
            <a
              href={whatsappLink("Hola, quiero asesoría para elegir un suplemento.")}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-white/25 px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase transition-colors hover:border-white/60"
            >
              Pedir asesoría
            </a>
          </div>
        </div>
      </section>

      {/* ── Categorías ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-bold">Categorías</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categorias.map((c) => (
            <Link
              key={c.slug}
              href={`/catalogo?categoria=${c.slug}`}
              className="group border p-5 transition-colors"
              style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
            >
              <span className="text-lg font-semibold normal-case">{c.name}</span>
              <span
                className="mt-1 block text-sm transition-colors group-hover:text-[var(--color-nexa-orange)]"
                style={{ color: "var(--text-muted)" }}
              >
                Ver productos
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Destacados ─────────────────────────────────────────────── */}
      {destacados.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 pb-14">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-bold">Destacados</h2>
            <Link
              href="/catalogo"
              className="text-sm font-medium"
              style={{ color: "var(--color-nexa-orange)" }}
            >
              Ver todo
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {destacados.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* ── Marcas ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-14">
        <h2 className="text-2xl font-bold">Marcas</h2>
        <div className="mt-5 flex flex-wrap gap-2">
          {marcas.map((m) => (
            <Link
              key={m.slug}
              href={`/catalogo?marca=${m.slug}`}
              className="border px-3.5 py-2 text-sm transition-colors hover:border-[var(--color-nexa-orange)]"
              style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
            >
              {m.name}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
