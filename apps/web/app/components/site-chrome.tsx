import Link from "next/link"
import { STORE, whatsappLink } from "@/lib/config"
import { NexaMark } from "./nexa-mark"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[var(--color-nexa-navy-deep)]">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5" aria-label={STORE.name}>
          <NexaMark size={34} />
          <span
            className="text-2xl leading-none font-bold text-white italic uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            NEXA
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/catalogo"
            className="rounded px-3 py-2 text-white/80 transition-colors hover:text-white"
          >
            Catálogo
          </Link>
          <Link
            href="/contacto"
            className="rounded px-3 py-2 text-white/80 transition-colors hover:text-white"
          >
            Contacto
          </Link>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-white/10 bg-[var(--color-nexa-navy-deep)] text-white/70">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2.5">
            <NexaMark size={30} />
            <span
              className="text-xl leading-none font-bold text-white italic uppercase"
              style={{ fontFamily: "var(--font-display)" }}
            >
              NEXA
            </span>
          </div>
          <p className="mt-3 max-w-[32ch] text-sm">{STORE.description}</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white">Tienda</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/catalogo" className="hover:text-white">
                Catálogo completo
              </Link>
            </li>
            <li>
              <Link href="/catalogo?categoria=proteinas" className="hover:text-white">
                Proteínas
              </Link>
            </li>
            <li>
              <Link href="/catalogo?categoria=creatinas" className="hover:text-white">
                Creatinas
              </Link>
            </li>
            <li>
              <Link href="/catalogo?categoria=preentrenos" className="hover:text-white">
                Preentrenos
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white">Contacto</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href={whatsappLink("Hola, quiero información sobre sus productos.")} className="hover:text-white">
                WhatsApp {STORE.whatsappDisplay}
              </a>
            </li>
            <li>
              <a href={`mailto:${STORE.email}`} className="hover:text-white">
                {STORE.email}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs">
          {STORE.name}. Todos los derechos reservados. Los suplementos no reemplazan una
          alimentación equilibrada ni constituyen consejo médico.
        </p>
      </div>
    </footer>
  )
}

export function WhatsAppFloating() {
  return (
    <a
      href={whatsappLink("Hola, los contacto desde la tienda NEXA. Quisiera asesoría.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Escribir por WhatsApp al ${STORE.whatsappDisplay}`}
      className="fixed right-5 bottom-5 z-50 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
      style={{ background: "var(--color-nexa-whatsapp)" }}
    >
      <svg viewBox="0 0 24 24" className="size-7" fill="#fff" aria-hidden="true">
        <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37s-1.04 1.01-1.04 2.47 1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.13h-.01c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.23 8.23z" />
      </svg>
    </a>
  )
}
