import type { Metadata, Viewport } from "next"
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import "./globals.css"

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-nexa-display",
  display: "swap",
})

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-nexa-sans",
  display: "swap",
})

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-nexa-mono",
  display: "swap",
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NEXA Sports Nutrition",
    template: "%s · NEXA Sports Nutrition",
  },
  description:
    "Suplementos deportivos de las mejores marcas. Compra en línea con pago seguro o coordina tu pedido por WhatsApp.",
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "NEXA Sports Nutrition",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFAF8" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0D14" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
