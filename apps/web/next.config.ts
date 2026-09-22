import { existsSync } from "node:fs"
import path from "node:path"
import { config as loadEnvFile } from "dotenv"
import type { NextConfig } from "next"

// El .env es único y vive en la raíz del monorepo, pero Next solo busca
// dentro de apps/web y se quedaría sin DATABASE_URL. Se carga a mano antes
// de compilar nada. En producción el archivo no existe y las variables las
// pone la plataforma, así que la comprobación de existencia no sobra.
const rootEnv = path.join(import.meta.dirname, "../../.env")
if (existsSync(rootEnv)) loadEnvFile({ path: rootEnv })

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Docker/K8s (ADR-0006). En Vercel el empaquetado lo hace la plataforma.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),

  // Los paquetes del workspace se publican como TypeScript sin compilar.
  transpilePackages: ["@nexa/core", "@nexa/db", "@nexa/ui"],

  // Prisma no debe entrar al bundle del servidor: se carga como módulo nativo.
  serverExternalPackages: ["@prisma/client"],

  // El motor de Prisma (.so.node) en Vercel.
  //
  // El cliente se genera en packages/db/generated/client, pero webpack lo
  // empaqueta dentro de apps/web, y desde ahí Prisma resuelve `generated/client`
  // relativo a la APP: en la función busca /var/task/apps/web/generated/client,
  // y la ruta absoluta que grabó al generar (/vercel/path0/packages/db/...) es
  // la del contenedor de build, que en runtime no existe. Incluir el motor
  // desde packages/db no sirve — viaja, pero a un sitio donde nadie lo mira.
  //
  // Por eso `vercel-build` lo copia a apps/web/generated/client, que es lo
  // PRIMERO que Prisma busca, y esto lo mete en cada función. La carpeta
  // está en .gitignore: solo existe durante el build.
  outputFileTracingIncludes: {
    "/**": ["./generated/client/**"],
  },

  images: {
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    // RNF-04. `unsafe-inline` en script/style es el mínimo con el que Next 15
    // hidrata; no se abre connect-src ni form-action más de lo que Wompi y
    // WhatsApp necesitan. El asistente vive en el servidor: Anthropic no
    // aparece aquí.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self' https://checkout.wompi.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ")

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
}

export default nextConfig
