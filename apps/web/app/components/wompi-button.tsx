import { Money, type Cents } from "@nexa/core"
import { wompiGateway } from "@/lib/wompi"

/**
 * Botón de pago de Wompi (Checkout Web).
 *
 * Es un formulario que hace POST al checkout de Wompi, no un script: menos
 * JavaScript y funciona igual con el bloqueador de anuncios más agresivo.
 *
 * Lo que viaja al navegador es solo la clave PÚBLICA, la referencia, el
 * importe y la firma. La firma se calcula en el servidor con el secreto de
 * integridad, que nunca sale de ahí: por eso el cliente no puede cambiar el
 * importe — al hacerlo, la firma deja de cuadrar y Wompi rechaza.
 *
 * Si la pasarela no está configurada no se renderiza nada y la tienda sigue
 * funcionando con WhatsApp (RNF-03).
 */
export function WompiButton({
  orderNumber,
  totalCents,
}: {
  orderNumber: string
  totalCents: Cents
}) {
  const gateway = wompiGateway()
  if (!gateway) return null

  const intent = gateway.createIntent(orderNumber, totalCents)

  return (
    <form action="https://checkout.wompi.co/p/" method="GET" className="mt-6">
      <input type="hidden" name="public-key" value={intent.publicKey} />
      <input type="hidden" name="currency" value={intent.currency} />
      <input type="hidden" name="amount-in-cents" value={intent.amountCents} />
      <input type="hidden" name="reference" value={intent.reference} />
      <input type="hidden" name="signature:integrity" value={intent.signature} />
      <input type="hidden" name="redirect-url" value={intent.redirectUrl} />

      <button
        type="submit"
        className="w-full px-6 py-4 text-sm font-semibold tracking-wide text-white uppercase sm:w-auto"
        style={{ background: "var(--color-nexa-orange)" }}
      >
        Pagar {Money.format(totalCents)} con Wompi
      </button>
      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        Tarjeta, PSE, Nequi o Bancolombia. Te devolvemos aquí al terminar.
      </p>
    </form>
  )
}
