import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { issueToken, verifyToken } from "./admin-auth"

/** Firma como lo hace el módulo, para fabricar testigos de prueba. */
function firmar(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

// El módulo lee la variable en cada llamada, no al importarse, así que se
// puede cambiar por prueba.
const SECRET = "un-secreto-de-al-menos-32-caracteres-largo"
const original = process.env.ADMIN_SESSION_SECRET

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET
})

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_SESSION_SECRET
  else process.env.ADMIN_SESSION_SECRET = original
})

describe("sesión del panel sin secreto configurado", () => {
  // Un panel abierto por falta de configuración es peor que uno inaccesible.
  it("no emite testigo", () => {
    delete process.env.ADMIN_SESSION_SECRET
    expect(issueToken("admin-1")).toBeNull()
  })

  it("no acepta ni un testigo que antes era válido", () => {
    const token = issueToken("admin-1")!
    delete process.env.ADMIN_SESSION_SECRET
    expect(verifyToken(token)).toBeNull()
  })

  it("rechaza un secreto demasiado corto para ser serio", () => {
    process.env.ADMIN_SESSION_SECRET = "corto"
    expect(issueToken("admin-1")).toBeNull()
  })

  it("acepta justo en el mínimo de 32 caracteres", () => {
    process.env.ADMIN_SESSION_SECRET = "x".repeat(32)
    expect(issueToken("admin-1")).not.toBeNull()
  })
})

describe("issueToken y verifyToken", () => {
  it("un testigo recién emitido identifica a su administrador", () => {
    const token = issueToken("admin-1")!
    expect(verifyToken(token)).toBe("admin-1")
  })

  it("el testigo lleva id, vencimiento y firma", () => {
    const partes = issueToken("admin-1")!.split(".")
    expect(partes).toHaveLength(3)
    expect(partes[0]).toBe("admin-1")
    expect(Number(partes[1])).toBeGreaterThan(Date.now())
  })

  it("no acepta el testigo de otro secreto", () => {
    const token = issueToken("admin-1")!
    process.env.ADMIN_SESSION_SECRET = "otro-secreto-de-mas-de-32-caracteres-aqui"
    expect(verifyToken(token)).toBeNull()
  })
})

describe("manipulación del testigo", () => {
  it("rechaza una firma cambiada", () => {
    const [id, exp] = issueToken("admin-1")!.split(".")
    expect(verifyToken(`${id}.${exp}.firmafalsa`)).toBeNull()
  })

  // El ataque obvio: cambiar el id para hacerse pasar por otro administrador.
  it("rechaza un id cambiado, porque el id va dentro de la firma", () => {
    const [, exp, firma] = issueToken("admin-1")!.split(".")
    expect(verifyToken(`admin-2.${exp}.${firma}`)).toBeNull()
  })

  // El otro ataque obvio: estirar el vencimiento.
  it("rechaza un vencimiento estirado, porque también va firmado", () => {
    const [id, , firma] = issueToken("admin-1")!.split(".")
    const dentroDeUnAno = Date.now() + 365 * 24 * 60 * 60 * 1000
    expect(verifyToken(`${id}.${dentroDeUnAno}.${firma}`)).toBeNull()
  })

  it("rechaza un testigo vencido aunque la firma cuadre", () => {
    const payload = `admin-1.${Date.now() - 1000}`
    const vigente = issueToken("admin-1")!
    // Se firma el payload vencido con el mismo secreto, imitando un testigo
    // legítimo que simplemente caducó.
    expect(verifyToken(`${payload}.${firmar(payload, SECRET)}`)).toBeNull()
    expect(verifyToken(vigente)).toBe("admin-1")
  })

  it("rechaza testigos mal formados", () => {
    for (const malo of ["", ".", "solo-una-parte", "dos.partes", "a..c", "..", "a.b."]) {
      expect(verifyToken(malo)).toBeNull()
    }
  })

  it("rechaza un vencimiento que no es un número", () => {
    const payload = "admin-1.manana"
    expect(verifyToken(`${payload}.${firmar(payload, SECRET)}`)).toBeNull()
  })

  it("rechaza un testigo con segmentos de sobra", () => {
    const token = issueToken("admin-1")!
    expect(verifyToken(`${token}.extra`)).toBeNull()
  })

  it("no revienta con una firma de otra longitud", () => {
    const [id, exp] = issueToken("admin-1")!.split(".")
    expect(verifyToken(`${id}.${exp}.x`)).toBeNull()
    expect(verifyToken(`${id}.${exp}.${"x".repeat(500)}`)).toBeNull()
  })
})
