import type { Metadata } from "next"
import { Money } from "@nexa/core"
import { orderRepository } from "@nexa/db"
import Link from "next/link"
import { notFound } from "next/navigation"
import { STORE, whatsappLink } from "@/lib/config"
import { readSession } from "@/lib/session"
import { wompiGateway } from "@/lib/wompi"
import { PaymentPoller } from "./payment-poller"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Resultado del pago",
  robots: { index: false, follow: false },
}

type Params = Promise<{ orderNumber: string }>
type Search = Promise<{ id?: string }>

/**
 * Adonde vuelve el cliente desde Wompi.
 *
 * Regla no negociable de ADR-0003: **el redirect no confirma nada**. Se
 * respeta al pie, y conviene ver por qué lo que sigue no la viola.
 *
 * Wompi añade `?id=<transacción>` al volver. Ese parámetro es manipulable,
 * así que NO se usa como estado — se usa como identificador. Con él se le
 * pregunta a Wompi, con nuestras credenciales, cuál es el estado real; y lo
 * que responda pasa además por la comprobación de importe contra el total de
 * la orden. Quien inventara un id ajeno solo conseguiría un rechazo.
 *
 * Esto no sustituye al webhook: lo adelanta. El webhook sigue siendo la vía
 * principal y los dos son idempotentes, así que da igual cuál llegue antes.
 * A cambio, el cliente ve su confirmación al instante en vez de mirar una
 * ruedita, y el id queda guardado para que la reconciliación pueda usarlo si
 * el webhook nunca aparece.
 */
export default async function ResultadoPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Search
}) {
  const { orderNumber } = await params
  const { id: transactionId } = await searchParams

  const sessionId = await readSession()
  let order = sessionId ? await orderRepository.findByNumber(orderNumber, sessionId) : null
  if (!order) notFound()

  if (transactionId && order.status === "PENDING_PAYMENT") {
    order = (await resolveWithGateway(orderNumber, transactionId)) ?? order
  }

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

/**
 * Le pregunta a Wompi por la transacción y aplica lo que responda.
 *
 * Nada de lo que falle aquí debe tumbar la página: si la pasarela no
 * contesta, o el id no es de esta orden, el cliente ve igualmente su pedido
 * y el webhook —o la reconciliación— resolverá por su cuenta. Por eso se
 * tragan los errores en vez de propagarlos.
 */
async function resolveWithGateway(orderNumber: string, transactionId: string) {
  const gateway = wompiGateway()
  if (!gateway) return null

  try {
    const payment = await gateway.fetchById(transactionId)
    // Un id que no corresponde a esta orden se descarta sin más. La
    // comprobación de importe de applyPayment lo atraparía igual, pero
    // rechazarlo aquí evita ensuciar el registro de pagos.
    if (!payment || payment.reference !== orderNumber) return null

    // Aunque siga PENDING se aplica: registra el id de transacción, que es
    // lo que necesitará la reconciliación si el webhook nunca llega.
    return await orderRepository.applyPayment(orderNumber, payment)
  } catch (error) {
    console.error(`[wompi] no se pudo resolver ${orderNumber} desde el redirect`, error)
    return null
  }
}
