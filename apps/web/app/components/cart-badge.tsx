import { cartRepository } from "@nexa/db"
import Link from "next/link"
import { readSession } from "@/lib/session"

/**
 * Insignia del carrito en el header. Es un Server Component: lee la sesión
 * de la cookie y consulta el carrito en cada render, así que nunca muestra
 * una cuenta obsoleta ni necesita estado en el cliente.
 *
 * Quien no ha añadido nada no tiene cookie, y entonces no se consulta la
 * base: navegar el catálogo no cuesta una consulta de más.
 */
export async function CartBadge() {
  const sessionId = await readSession()
  const cart = sessionId ? await cartRepository.find(sessionId) : null
  const count = cart?.itemCount ?? 0

  return (
    <Link
      href="/carrito"
      className="relative rounded px-3 py-2 text-white/80 transition-colors hover:text-white"
      aria-label={count > 0 ? `Carrito, ${count} unidades` : "Carrito vacío"}
    >
      Carrito
      {count > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full text-[0.65rem] font-bold text-white tabular-nums"
          style={{ background: "var(--color-nexa-orange)" }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  )
}
