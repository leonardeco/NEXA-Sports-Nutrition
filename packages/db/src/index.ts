import { PrismaClient } from "../generated/client/index.js"

// En desarrollo, Next.js recarga los módulos en cada cambio. Sin este
// singleton se abriría una conexión nueva por recarga hasta agotar el pool
// de PostgreSQL — y en Neon, el pool es pequeño.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export * from "../generated/client/index.js"
