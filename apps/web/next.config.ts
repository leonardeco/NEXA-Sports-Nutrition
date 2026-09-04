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

  // Necesario para la imagen Docker y los manifiestos de K8s de F6 (ADR-0006).
  // En Vercel es inocuo.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),

  // Los paquetes del workspace se publican como TypeScript sin compilar.
  transpilePackages: ["@nexa/core", "@nexa/db", "@nexa/ui"],

  // Prisma no debe entrar al bundle del servidor: se carga como módulo nativo.
  serverExternalPackages: ["@prisma/client"],

  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Cabeceras base. La CSP estricta llega en F5 (RNF-04), cuando ya se sabe
  // qué orígenes necesitan Wompi y el asistente.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
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
