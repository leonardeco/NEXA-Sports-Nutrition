import Link from "next/link"
import { STORE, whatsappLink } from "@/lib/config"

/**
 * 404 de toda la tienda. La cabecera y el pie los pone el layout, así que
 * aquí solo va el cuerpo: quien llega a un enlace muerto tiene que poder
 * seguir comprando sin volver atrás a ciegas.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-24 text-center">
      <p
        className="font-mono text-[0.7rem] tracking-[0.22em] uppercase"
        style={{ color: "var(--accent-text)" }}
      >
        Error 404
      </p>

      <h1 className="mt-3 text-4xl leading-none font-bold sm:text-5xl">
        Esta página no existe
      </h1>

      <p className="mx-auto mt-4 max-w-[46ch]" style={{ color: "var(--text-secondary)" }}>
        Puede que el producto ya no esté a la venta o que el enlace esté mal escrito. El
        catálogo completo sigue donde siempre.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/catalogo"
          className="px-6 py-3 text-sm font-semibold tracking-wide text-[var(--color-nexa-ink)] uppercase"
          style={{ background: "var(--color-nexa-orange)" }}
        >
          Ver catálogo
        </Link>
        <Link
          href="/"
          className="border px-6 py-3 text-sm font-semibold tracking-wide uppercase"
          style={{ borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
        >
          Ir al inicio
        </Link>
      </div>

      <p className="mt-8 text-sm" style={{ color: "var(--text-muted)" }}>
        ¿Buscabas algo concreto?{" "}
        <a
          href={whatsappLink("Hola, no encuentro un producto en la tienda.")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
          style={{ color: "var(--whatsapp-text)" }}
        >
          Escríbenos al {STORE.whatsappDisplay}
        </a>
      </p>
    </main>
  )
}
