import { describe, expect, it } from "vitest"
import { isLocalHost, resolveDatabaseUrl } from "./database-url"

const NEON = "postgresql://u:p@ep-noisy-snow.us-east-2.aws.neon.tech/neondb"
const LOCAL = "postgresql://nexa:nexa@localhost:5432/nexa?schema=public"

describe("resolveDatabaseUrl", () => {
  it("sin cadena configurada devuelve undefined", () => {
    expect(resolveDatabaseUrl(undefined)).toBeUndefined()
    expect(resolveDatabaseUrl("")).toBeUndefined()
    expect(resolveDatabaseUrl("   ")).toBeUndefined()
  })

  it("exige TLS a un servidor remoto", () => {
    expect(resolveDatabaseUrl(NEON)).toContain("sslmode=require")
  })

  // El fallo que tumbaba el E2E: forzar TLS contra el PostgreSQL del
  // docker-compose, que no lo soporta, mata la primera consulta con
  // "server does not support TLS".
  it("no exige TLS a una base local", () => {
    const resuelta = resolveDatabaseUrl(LOCAL)
    expect(resuelta).not.toContain("sslmode")
    expect(resuelta).toContain("schema=public")
  })

  it("respeta el sslmode que venga escrito, sea cual sea", () => {
    expect(resolveDatabaseUrl(`${NEON}?sslmode=disable`)).toContain("sslmode=disable")
    expect(resolveDatabaseUrl(`${LOCAL}&sslmode=require`)).toContain("sslmode=require")
  })

  // Prisma en las funciones de Vercel falla si Neon manda este parámetro.
  it("quita channel_binding venga de donde venga", () => {
    expect(resolveDatabaseUrl(`${NEON}?channel_binding=require`)).not.toContain("channel_binding")
    expect(resolveDatabaseUrl(`${LOCAL}&channel_binding=require`)).not.toContain("channel_binding")
  })

  it("conserva el resto de parámetros", () => {
    const resuelta = resolveDatabaseUrl(`${NEON}?connection_limit=5&channel_binding=require`)
    expect(resuelta).toContain("connection_limit=5")
  })

  it("una cadena ilegible se pasa tal cual, para que falle Prisma y no nosotros", () => {
    expect(resolveDatabaseUrl("esto no es una url")).toBe("esto no es una url")
  })
})

describe("isLocalHost", () => {
  it("reconoce las formas habituales de localhost", () => {
    for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]) {
      expect(isLocalHost(host)).toBe(true)
    }
  })

  it("reconoce los nombres de servicio de docker-compose y Kubernetes", () => {
    expect(isLocalHost("postgres")).toBe(true)
    expect(isLocalHost("nexa-postgres")).toBe(true)
    expect(isLocalHost("nexa-postgres.nexa.svc.cluster.local")).toBe(true)
    expect(isLocalHost("host.docker.internal")).toBe(true)
  })

  it("no confunde un servidor remoto con uno local", () => {
    for (const host of [
      "ep-noisy-snow.us-east-2.aws.neon.tech",
      "db.example.com",
      "postgres.example.com",
      "notlocalhost.com",
    ]) {
      expect(isLocalHost(host)).toBe(false)
    }
  })
})
