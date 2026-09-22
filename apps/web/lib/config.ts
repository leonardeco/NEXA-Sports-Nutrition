import { Money, type Cents } from "@nexa/core"

/**
 * Datos de la tienda que la interfaz necesita. Lo que cambia por entorno
 * viene de variables; lo demás es contenido y vive aquí hasta que el panel
 * de administración lo gestione.
 */
export const STORE = {
  name: "NEXA Sports Nutrition",
  shortName: "NEXA",
  tagline: "Entrenas en serio. Nosotros también.",
  description:
    "Suplementos deportivos de las mejores marcas del mundo, con envío a todo el país.",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "leonardecojt@gmail.com",
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "573226993891",
  whatsappDisplay: "+57 322 699 3891",
  city: "Colombia",
} as const

/**
 * Campaña de portada. `null` apaga la sección. Es contenido, no código: vive
 * aquí hasta que el panel lo gestione. La imagen va en `public/`.
 */
export const PROMO: {
  image: string
  alt: string
  eyebrow: string
  title: string
  brand: string
  copy: string
  cta: string
  whatsappMessage: string
  secondaryHref?: string
  secondaryLabel?: string
} | null = {
  image: "/img/banners/electron-lanzamiento.webp",
  alt: "Electron Hydration Drink Mix de Healthy Sports, cajas de varios sabores",
  eyebrow: "Nuevo lanzamiento",
  title: "Electron Hydration",
  brand: "Healthy Sports",
  copy:
    "Polvo de hidratación en sobres de una porción, doce por caja y en varios sabores. Muy pronto en NEXA: pregunta por él y te avisamos cuando llegue.",
  cta: "Quiero saber más",
  whatsappMessage: "Hola, vi el lanzamiento de Electron Hydration de Healthy Sports. ¿Cuándo llega y qué sabores tendrán?",
  secondaryHref: "/catalogo?marca=healthy-sports",
  secondaryLabel: "Ver Healthy Sports",
}

export function whatsappLink(message: string): string {
  return `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(message)}`
}

/**
 * Mensaje de WhatsApp con el pedido completo (RF-16).
 *
 * Lleva las líneas y no solo el número: quien atiende el chat tiene que
 * saber qué se pidió sin ir a buscarlo al panel. Los saltos de línea
 * sobreviven al `encodeURIComponent` y WhatsApp los respeta.
 */
export function orderWhatsappMessage(
  order: {
    orderNumber: string
    totalCents: Cents
    shippingCents: Cents
    lines: readonly { productName: string; quantity: number; lineTotalCents: Cents }[]
  },
  intent: string,
): string {
  const items = order.lines
    .map((l) => `- ${l.productName} x${l.quantity}: ${Money.format(l.lineTotalCents)}`)
    .join("\n")

  return [
    `Hola, mi pedido es *${order.orderNumber}*:`,
    items,
    `Envío ${Money.format(order.shippingCents)} · Total *${Money.format(order.totalCents)}*`,
    intent,
  ].join("\n")
}

export const PRICE_RANGES = [
  { slug: "todos", label: "Todos los precios", min: undefined, max: undefined },
  { slug: "hasta-100", label: "Hasta $100.000", min: undefined, max: 10_000_000 },
  { slug: "100-200", label: "$100.000 a $200.000", min: 10_000_000, max: 20_000_000 },
  { slug: "200-350", label: "$200.000 a $350.000", min: 20_000_000, max: 35_000_000 },
  { slug: "mas-350", label: "Más de $350.000", min: 35_000_000, max: undefined },
] as const

export const SORT_OPTIONS = [
  { slug: "relevancia", label: "Relevancia" },
  { slug: "precio-asc", label: "Menor precio" },
  { slug: "precio-desc", label: "Mayor precio" },
  { slug: "nombre", label: "Nombre" },
] as const
