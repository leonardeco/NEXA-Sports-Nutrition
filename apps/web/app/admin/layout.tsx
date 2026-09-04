import type { Metadata } from "next"
import Link from "next/link"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false, follow: false },
}

/**
 * Guardia de todo `/admin/**`. `requireAdmin` responde 404 si no hay sesión
 * (RF-24), así que ninguna página de abajo necesita comprobar nada: si se
 * está ejecutando, es que hay administrador.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <div>
      <header
        className="border-b"
        style={{ borderColor: "var(--border-subtle)", background: "var(--color-nexa-navy-deep)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
          <Link href="/admin" className="text-sm font-semibold tracking-[0.16em] text-white uppercase">
            Panel
          </Link>
          <Link href="/" className="ml-auto text-sm text-white/70 hover:text-white">
            Ver la tienda
          </Link>
        </div>
      </header>
      {children}
    </div>
  )
}
