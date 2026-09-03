import Image from "next/image"
import Link from "next/link"
import { Money, type ProductSummary } from "@nexa/core"

export function ProductCard({ product }: { product: ProductSummary }) {
  const agotado = product.stock <= 0

  return (
    <article
      className="group flex flex-col border transition-colors"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
    >
      <Link href={`/producto/${product.slug}`} className="relative block aspect-square overflow-hidden bg-white">
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-400">
            Sin imagen
          </div>
        )}

        {product.badge && !agotado && (
          <span
            className="absolute top-2 left-2 px-2 py-1 text-[0.62rem] font-semibold tracking-wide uppercase text-white"
            style={{ background: "var(--color-nexa-orange)" }}
          >
            {product.badge}
          </span>
        )}

        {agotado && (
          <span className="absolute top-2 left-2 bg-neutral-900 px-2 py-1 text-[0.62rem] font-semibold tracking-wide text-white uppercase">
            Agotado
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3.5">
        <span
          className="text-[0.66rem] font-medium tracking-[0.12em] uppercase"
          style={{ color: "var(--text-muted)" }}
        >
          {product.brand.name}
        </span>

        <h3 className="mt-1 flex-1 text-[0.92rem] leading-snug font-semibold normal-case">
          <Link href={`/producto/${product.slug}`} className="hover:underline">
            {product.name}
          </Link>
        </h3>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span
            className="text-lg font-bold tabular-nums"
            style={{ color: agotado ? "var(--text-muted)" : "var(--color-nexa-orange)" }}
          >
            {Money.format(product.priceCents)}
          </span>
          {!agotado && product.stock <= 5 && (
            <span className="text-[0.68rem]" style={{ color: "var(--color-nexa-warning)" }}>
              Quedan {product.stock}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
