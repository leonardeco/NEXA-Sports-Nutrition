import { Money } from "@nexa/core"
import { NexaLockup } from "./components/nexa-mark"

/**
 * Página de estado de F0. No es la portada de la tienda: existe para
 * comprobar de un vistazo que las fundaciones están vivas —tokens, fuentes,
 * y el dominio importado desde `@nexa/core` ejecutándose de verdad—.
 * La reemplaza la portada real en F1.
 */

const fundaciones = [
  { id: "pnpm", label: "Monorepo pnpm", detail: "apps/web · packages/core · db · ui", listo: true },
  { id: "ts", label: "TypeScript estricto", detail: "noUncheckedIndexedAccess, exactOptionalPropertyTypes", listo: true },
  { id: "lint", label: "Frontera del dominio", detail: "ESLint prohíbe next, prisma y react en packages/core", listo: true },
  { id: "prisma", label: "Esquema Prisma", detail: "16 modelos, pgvector, inventario como libro de movimientos", listo: true },
  { id: "money", label: "Dinero en centavos", detail: "ADR-0007 · 14 tests en packages/core", listo: true },
  { id: "ui", label: "Tokens NEXA", detail: "Negro, blanco y naranja · Barlow Condensed + IBM Plex Sans", listo: true },
  { id: "ci", label: "Integración continua", detail: "lint → typecheck → test → build", listo: true },
  { id: "docker", label: "PostgreSQL local", detail: "docker-compose escrito · falta instalar Docker Desktop", listo: false },
]

const paleta = [
  { nombre: "Ink", valor: "#0A0A0A", uso: "Fondo y tipografía" },
  { nombre: "Navy", valor: "#0F1B33", uso: "Superficies oscuras" },
  { nombre: "Paper", valor: "#FFFFFF", uso: "Superficies claras" },
  { nombre: "Orange", valor: "#FF5A1F", uso: "Acento: CTA y precio" },
  { nombre: "WhatsApp", valor: "#25D366", uso: "Solo el botón flotante" },
]

export default function Home() {
  // El dominio ejecutándose: el precio de Nitro Tech 2 LBS, migrado desde
  // los 185.000 pesos de productos.json a centavos.
  const precioEjemplo = Money.fromCOP(185_000)
  const totalTresUnidades = Money.multiply(precioEjemplo, 3)

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <NexaLockup />

      <p
        className="mt-10 font-mono text-[0.7rem] uppercase tracking-[0.2em]"
        style={{ color: "var(--color-nexa-orange)" }}
      >
        Fase 0 · Fundaciones
      </p>
      <h1 className="mt-2 text-4xl leading-none font-bold sm:text-5xl">
        El andamiaje está en pie
      </h1>
      <p className="mt-4 max-w-[60ch]" style={{ color: "var(--text-secondary)" }}>
        Esta página no es la tienda. Comprueba que el monorepo, los tokens de marca y el
        dominio funcionan juntos antes de migrar los 127 productos en la fase 1.
      </p>

      <section className="mt-12">
        <h2 className="text-xl font-bold">Fundaciones</h2>
        <ul className="mt-4 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {fundaciones.map((f) => (
            <li key={f.id} className="flex items-start gap-3 py-3">
              <span
                aria-hidden="true"
                className="mt-[0.45rem] size-2 shrink-0 rounded-full"
                style={{
                  background: f.listo ? "var(--color-nexa-success)" : "var(--color-nexa-warning)",
                }}
              />
              <span className="flex-1">
                <span className="block text-sm font-semibold">{f.label}</span>
                <span className="block text-sm" style={{ color: "var(--text-muted)" }}>
                  {f.detail}
                </span>
              </span>
              <span className="sr-only">{f.listo ? "Listo" : "Pendiente"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold">El dominio, ejecutándose</h2>
        <div
          className="mt-4 border p-5 font-mono text-sm"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
        >
          <div style={{ color: "var(--text-muted)" }}>Money.fromCOP(185_000)</div>
          <div className="mt-1">
            <span style={{ color: "var(--color-nexa-orange)" }}>{precioEjemplo}</span>{" "}
            <span style={{ color: "var(--text-muted)" }}>centavos</span>
          </div>
          <div className="mt-4" style={{ color: "var(--text-muted)" }}>
            Money.format(Money.multiply(precio, 3))
          </div>
          <div className="mt-1 text-lg font-semibold">{Money.format(totalTresUnidades)}</div>
        </div>
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
          Importado desde <code>@nexa/core</code>, que no puede importar Next ni Prisma —
          el lint lo impide.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold">Paleta</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {paleta.map((c) => (
            <div key={c.nombre} className="border" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="h-14" style={{ background: c.valor }} />
              <div className="p-2.5">
                <div className="text-xs font-semibold">{c.nombre}</div>
                <div className="font-mono text-[0.68rem]" style={{ color: "var(--text-muted)" }}>
                  {c.valor}
                </div>
                <div className="mt-1 text-[0.68rem] leading-tight" style={{ color: "var(--text-muted)" }}>
                  {c.uso}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer
        className="mt-14 border-t pt-5 text-sm"
        style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
      >
        Siguiente: <strong style={{ color: "var(--text-primary)" }}>F1 · Catálogo</strong> —
        migrar 127 productos y 274 imágenes, y reemplazar esta página por la portada real.
      </footer>
    </main>
  )
}
