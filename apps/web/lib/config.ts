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

export function whatsappLink(message: string): string {
  return `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(message)}`
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
