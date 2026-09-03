import type { Metadata } from "next"
import { STORE, whatsappLink } from "@/lib/config"

export const metadata: Metadata = {
  title: "Contacto",
  description: `Escríbenos por WhatsApp al ${STORE.whatsappDisplay} o al correo ${STORE.email}.`,
}

export default function ContactoPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-4xl font-bold">Contacto</h1>
      <p className="mt-3 max-w-[58ch]" style={{ color: "var(--text-secondary)" }}>
        Resolvemos dudas sobre productos, disponibilidad y envíos. Si no sabes qué
        suplemento te conviene, escríbenos y te orientamos según tu objetivo.
      </p>

      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        <a
          href={whatsappLink("Hola, los contacto desde la tienda NEXA.")}
          target="_blank"
          rel="noopener noreferrer"
          className="border p-6 transition-colors hover:border-[var(--color-nexa-whatsapp)]"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
        >
          <span
            className="text-[0.68rem] font-medium tracking-[0.16em] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Respuesta más rápida
          </span>
          <span className="mt-1 block text-xl font-semibold">WhatsApp</span>
          <span className="mt-1 block text-sm" style={{ color: "var(--color-nexa-whatsapp)" }}>
            {STORE.whatsappDisplay}
          </span>
        </a>

        <a
          href={`mailto:${STORE.email}`}
          className="border p-6 transition-colors hover:border-[var(--color-nexa-orange)]"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}
        >
          <span
            className="text-[0.68rem] font-medium tracking-[0.16em] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Pedidos y facturación
          </span>
          <span className="mt-1 block text-xl font-semibold">Correo</span>
          <span className="mt-1 block text-sm break-all" style={{ color: "var(--text-secondary)" }}>
            {STORE.email}
          </span>
        </a>
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">Envíos</h2>
        <p className="mt-2 max-w-[58ch]" style={{ color: "var(--text-secondary)" }}>
          Hacemos envíos a todo el país. El tiempo estimado es de 3 a 5 días hábiles según
          la ciudad. El costo se confirma al coordinar el pedido.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Pagos</h2>
        <p className="mt-2 max-w-[58ch]" style={{ color: "var(--text-secondary)" }}>
          Por ahora el pago se coordina por WhatsApp. El pago en línea con PSE, Nequi,
          tarjeta y Bancolombia entra en funcionamiento en la siguiente fase.
        </p>
      </section>
    </main>
  )
}
