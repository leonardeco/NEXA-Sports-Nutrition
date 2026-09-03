import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Money } from "@nexa/core"
import { productRepository } from "@nexa/db"
import { STORE, whatsappLink } from "@/lib/config"

export const dynamic = "force-dynamic"

type Params = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const product = await productRepository.findBySlug(slug)
  if (!product) return { title: "Producto no encontrado" }

  return {
    title: product.name,
    description: product.description ?? `${product.name} de ${product.brand.name}.`,
    openGraph: {
      title: `${product.name} · ${product.brand.name}`,
      description: product.description ?? undefined,
      images: product.image ? [{ url: product.image.url }] : undefined,
    },
  }
}

export default async function ProductoPage({ params }: { params: Params }) {
  const { slug } = await params
  const product = await productRepository.findBySlug(slug)
  if (!product) notFound()

  const agotado = product.stock <= 0
  const mensaje = `Hola, me interesa el producto *${product.name}* (${product.brand.name}) — ${Money.format(product.priceCents)}. ¿Está disponible?`

  // Datos estructurados para resultados enriquecidos (RNF-10).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    brand: { "@type": "Brand", name: product.brand.name },
    sku: product.variants[0]?.sku,
    image: product.images.map((i) => i.url),
    offers: {
      "@type": "Offer",
      price: Money.toCOP(product.priceCents),
      priceCurrency: "COP",
      availability: agotado
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
    },
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="text-xs" style={{ color: "var(--text-muted)" }} aria-label="Ruta">
        <Link href="/catalogo" className="hover:underline">
          Catálogo
        </Link>
        <span className="px-1.5">/</span>
        <Link href={`/catalogo?categoria=${product.category.slug}`} className="hover:underline">
          {product.category.name}
        </Link>
      </nav>

      <div className="mt-5 grid gap-10 lg:grid-cols-2">
        {/* ── Imagen ─────────────────────────────────────────────── */}
        <div
          className="relative aspect-square border bg-white"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain p-8"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              Sin imagen
            </div>
          )}
        </div>

        {/* ── Ficha ──────────────────────────────────────────────── */}
        <div>
          <Link
            href={`/catalogo?marca=${product.brand.slug}`}
            className="text-[0.7rem] font-medium tracking-[0.16em] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            {product.brand.name}
          </Link>

          <h1 className="mt-2 text-3xl leading-tight font-bold normal-case sm:text-4xl">
            {product.name}
          </h1>

          <p
            className="mt-4 text-3xl font-bold tabular-nums"
            style={{ color: "var(--color-nexa-orange)" }}
          >
            {Money.format(product.priceCents)}
          </p>

          <p className="mt-2 text-sm">
            {agotado ? (
              <span style={{ color: "var(--text-muted)" }}>Agotado por ahora</span>
            ) : product.stock <= 5 ? (
              <span style={{ color: "var(--color-nexa-warning)" }}>
                Últimas {product.stock} unidades
              </span>
            ) : (
              <span style={{ color: "var(--color-nexa-success)" }}>Disponible</span>
            )}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={whatsappLink(mensaje)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase"
              style={{ background: agotado ? "var(--text-muted)" : "var(--color-nexa-whatsapp)" }}
            >
              {agotado ? "Consultar disponibilidad" : "Pedir por WhatsApp"}
            </a>
          </div>

          <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
            El pago en línea con Wompi llega en la siguiente fase. Por ahora el pedido se
            coordina por WhatsApp al {STORE.whatsappDisplay}.
          </p>

          {product.description && (
            <Section title="Descripción">
              <p>{product.description}</p>
            </Section>
          )}
          {product.benefits && (
            <Section title="Beneficios">
              <p>{product.benefits}</p>
            </Section>
          )}
          {product.usageInstructions && (
            <Section title="Modo de uso">
              <p>{product.usageInstructions}</p>
            </Section>
          )}

          <Section title="Referencia">
            <p className="font-mono text-xs">{product.variants[0]?.sku}</p>
          </Section>

          <p
            className="mt-8 border-t pt-4 text-xs"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
          >
            Los suplementos complementan la alimentación; no la reemplazan ni son consejo
            médico. Consulta a un profesional si tienes alguna condición de salud.
          </p>
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <h2
        className="text-[0.68rem] font-medium tracking-[0.16em] uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h2>
      <div className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {children}
      </div>
    </div>
  )
}
