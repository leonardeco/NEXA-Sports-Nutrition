import type { Metadata } from "next"
import { Money } from "@nexa/core"
import { orderRepository } from "@nexa/db"
import Link from "next/link"
import { notFound } from "next/navigation"
import { STORE, whatsappLink } from "@/lib/config"
import { readSession } from "@/lib/session"
import { PaymentPoller } from "./payment-poller"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Resultado del pago",
  robots: { index: false, follow: false },
}

type Params = Promise<{ orderNumber: string }>

/**
 * Adonde vuelve el cliente desde Wompi.
 *
 * Regla no negociable de ADR-0003: **este redirect no confirma nada**. Aquí
 * no se lee ningún parámetro que venga de la pasarela ni se cambia el estado
 * de la orden. Solo se consulta lo que dice nuestra base, que se actualiza
 * únicamente por webhook o por reconciliación.
 *
 * Como el webhook puede tardar unos segundos, mientras la orden siga
 * pendiente se consulta cada pocos segundos hasta que se resuelva.
 */
export default async function ResultadoPage({ params }: { params: Params }) {
  const { orderNumber } = await params

  const sessionId = await readSession()
  const order = sessionId ? await orderRepository.findByNumber(orderNumber, sessionId) : null
  if (!order) notFound()

  const pagado = order.status === "PAID"
  const fallido = order.status === "PAYMENT_FAILED"
  const esperando = order.status === "PENDING_PAYMENT"

  return (
    <main className="mx-auto max-w-xl px-5 py-16 text-center">
      {esperando && <PaymentPoller orderNumber={order.orderNumber} />}

      <h1 className="text-3xl font-bold">
        {pagado
          ? "Pago confirmado"
          : fallido
            ? "El pago no se completó"
            : esperando
              ? "Confirmando tu pago"
              : "Tu pedido"}
      </h1>

      <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
        {pagado ? (
          <>
            Recibimos {Money.format(order.totalCents)}. Ya estamos preparando tu pedido y te
            escribimos cuando salga.
          </>
        ) : fallido ? (
          <>
            El banco no autorizó el cobro y liberamos las unidades que teníamos apartadas.
            Puedes intentarlo otra vez desde tu pedido o escribirnos.
          </>
        ) : esperando ? (
          <>
            Estamos esperando la confirmación de la pasarela. Suele tardar unos segundos;
            esta página se actualiza sola.
          </>
        ) : (
          <>Este pedido está en estado {order.status.toLowerCase()}.</>
        )}
      </p>

      <p className="mt-6 font-mono text-sm" style={{ color: "var(--text-muted)" }}>
        {order.orderNumber}
      </p>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link
          href={`/orden/${order.orderNumber}`}
          className="px-6 py-3 text-sm font-semibold tracking-wide text-white uppercase"
          style={{ background: "var(--color-nexa-navy-deep)" }}
        >
          Ver mi pedido
        </Link>

        {!pagado && (
          <a
            href={whatsappLink(
              `Hola, tengo el pedido *${order.orderNumber}* y quiero ayuda con el pago.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
            style={{ color: "var(--text-muted)" }}
          >
            Escribirnos al {STORE.whatsappDisplay}
          </a>
        )}
      </div>
    </main>
  )
}
