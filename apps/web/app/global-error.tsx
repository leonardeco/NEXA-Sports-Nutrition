"use client"

import { useEffect } from "react"
import { STORE, whatsappLink } from "@/lib/config"

/**
 * Último recurso: se muestra cuando falla el propio layout raíz, así que
 * sustituye al documento entero y tiene que traer su `<html>` y su `<body>`.
 *
 * Por eso no usa Tailwind ni las variables de tema: si esto se renderiza,
 * puede que la hoja de estilos sea justamente lo que no cargó. Todo va en
 * estilos en línea, con colores fijos de la marca, para que la página se
 * sostenga sola.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[tienda] fallo en el layout raíz", error)
  }, [error])

  return (
    <html lang="es-CO">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem 1.25rem",
          background: "#060C1A",
          color: "#ECEFF5",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "34rem" }}>
          <svg width="52" height="52" viewBox="0 0 64 64" role="img" aria-label="NEXA">
            <rect width="64" height="64" rx="14" fill="#0A1120" />
            <path d="M17 14 L47 50" stroke="#2E3542" strokeWidth="9" strokeLinecap="square" />
            <path d="M15 51 L45 19" stroke="#FF5A1F" strokeWidth="9" />
            <path d="M52 12 L50 30 L34 14 Z" fill="#FF5A1F" />
          </svg>

          <h1
            style={{
              margin: "1.5rem 0 0",
              fontSize: "1.9rem",
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
            }}
          >
            La tienda no pudo cargar
          </h1>

          <p style={{ margin: "0.9rem 0 0", color: "#B9C1D0", lineHeight: 1.6 }}>
            Fue de nuestro lado. Puedes reintentar o hacer tu pedido por WhatsApp, que
            seguimos atendiendo igual.
          </p>

          <div
            style={{
              marginTop: "1.75rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#FF5A1F",
                color: "#fff",
                border: "none",
                padding: "0.85rem 1.6rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>

            <a
              href={whatsappLink("Hola, la tienda no carga y quiero hacer mi pedido.")}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "#25D366",
                color: "#fff",
                padding: "0.85rem 1.6rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                textDecoration: "none",
              }}
            >
              Pedir por WhatsApp
            </a>
          </div>

          <p style={{ marginTop: "1.5rem", fontSize: "0.82rem", color: "#838CA0" }}>
            {STORE.whatsappDisplay}
            {error.digest ? ` · Referencia ${error.digest}` : ""}
          </p>
        </main>
      </body>
    </html>
  )
}
