import { existsSync } from "node:fs"
import path from "node:path"
import Image from "next/image"
import Link from "next/link"
import { PROMO, whatsappLink } from "@/lib/config"

/**
 * Campaña de portada: una pieza publicitaria con su llamada a la acción.
 *
 * La configuración vive en `PROMO` (lib/config.ts). Si no hay campaña, o la
 * imagen todavía no está en `public/`, la sección no se renderiza: la
 * portada nunca muestra una imagen rota por una campaña a medio montar.
 *
 * La pieza suele venir en vertical (formato de historia). En escritorio va
 * a un lado con el texto al otro, para que no ocupe media pantalla de alto;
 * en móvil se apila y ocupa el ancho, que es el formato para el que se hizo.
 */
export function PromoBanner() {
  if (!PROMO) return null

  const onDisk = path.join(process.cwd(), "public", PROMO.image)
  if (!existsSync(onDisk)) return null

  return (
    <section className="mx-auto max-w-6xl px-5 pt-14">
      <div
        className="grid overflow-hidden border md:grid-cols-[minmax(0,26rem)_1fr]"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
      >
        <div className="relative aspect-[9/16] md:aspect-auto md:min-h-[28rem]">
          <Image
            src={PROMO.image}
            alt={PROMO.alt}
            fill
            sizes="(max-width: 768px) 100vw, 26rem"
            className="object-cover"
          />
        </div>

        <div className="flex flex-col justify-center p-7 md:p-10">
          <p
            className="font-mono text-[0.7rem] tracking-[0.22em] uppercase"
            style={{ color: "var(--accent-text)" }}
          >
            {PROMO.eyebrow}
          </p>
          <h2 className="mt-3 text-4xl leading-[0.95] font-bold sm:text-5xl">{PROMO.title}</h2>
          <p className="mt-2 text-sm font-medium tracking-[0.16em] uppercase" style={{ color: "var(--text-muted)" }}>
            {PROMO.brand}
          </p>
          <p className="mt-5 max-w-[46ch]" style={{ color: "var(--text-secondary)" }}>
            {PROMO.copy}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={whatsappLink(PROMO.whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 text-sm font-semibold tracking-wide text-[var(--color-nexa-ink)] uppercase"
              style={{ background: "var(--color-nexa-orange)" }}
            >
              {PROMO.cta}
            </a>
            {PROMO.secondaryHref && PROMO.secondaryLabel && (
              <Link
                href={PROMO.secondaryHref}
                className="border border-white/25 px-6 py-3 text-sm font-semibold tracking-wide uppercase transition-colors hover:border-white/60"
              >
                {PROMO.secondaryLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
