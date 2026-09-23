"use client"

import Link from "next/link"
import { useEffect } from "react"
import { STORE, whatsappLink } from "@/lib/config"

/**
 * Frontera de error de la tienda. Sin esto, un fallo del servidor dejaba al
 * cliente ante el "Application error" por defecto de Next: sin marca, sin
 * catálogo y sin forma de contactar, justo lo que el RNF-03 dice que no
 * puede pasar.
 *
 * `reset` reintenta el render sin recargar la página, que cubre el caso más
 * común: una consulta que falló por un corte momentáneo con la base.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[tienda] fallo no controlado", error)
  }, [error])

  return (
    <main className="mx-auto max-w-2xl px-5 py-24 text-center">
      <p
        className="font-mono text-[0.7rem] tracking-[0.22em] uppercase"
        style={{ color: "var(--accent-text)" }}
      >
        Algo falló
      </p>

      <h1 className="mt-3 text-4xl leading-none font-bold sm:text-5xl">
        No pudimos cargar esta página
      </h1>

      <p className="mx-auto mt-4 max-w-[48ch]" style={{ color: "var(--text-secondary)" }}>
        Fue de nuestro lado, no tuyo. Si estabas comprando, tu carrito sigue guardado.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-6 py-3 text-sm font-semibold tracking-wide text-[var(--color-nexa-ink)] uppercase"
          style={{ background: "var(--color-nexa-orange)" }}
        >
          Reintentar
        </button>
        <Link
          href="/catalogo"
          className="border px-6 py-3 text-sm font-semibold tracking-wide uppercase"
          style={{ borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
        >
          Ver catálogo
        </Link>
      </div>

      <p className="mt-8 text-sm" style={{ color: "var(--text-muted)" }}>
        ¿Prefieres no esperar?{" "}
        <a
          href={whatsappLink("Hola, la tienda me dio un error y quiero hacer mi pedido.")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
          style={{ color: "var(--color-nexa-whatsapp)" }}
        >
          Haz tu pedido por WhatsApp al {STORE.whatsappDisplay}
        </a>
      </p>

      {/* El digest es lo único que permite cruzar este fallo con los logs. */}
      {error.digest && (
        <p className="mt-6 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
          Referencia: {error.digest}
        </p>
      )}
    </main>
  )
}
