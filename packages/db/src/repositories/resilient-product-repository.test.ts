import { AdminProductError, type ProductRepository } from "@nexa/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ResilientProductRepository, type AvisoDegradacion } from "./resilient-product-repository"

/** Repositorio de mentira: responde lo que se le diga o revienta. */
function fake(etiqueta: string, fallo?: Error): ProductRepository {
  const responder = async () => {
    if (fallo) throw fallo
    return etiqueta as never
  }
  return {
    findBySlug: responder,
    findById: responder,
    findBySlugForAdmin: responder,
    search: responder,
    listForAdmin: responder,
    listFeatured: responder,
    listBrands: responder,
    listCategories: responder,
    applyAdminProductChange: responder,
  } as unknown as ProductRepository
}

const avisos: Parameters<AvisoDegradacion>[0][] = []
const avisar: AvisoDegradacion = (e) => {
  avisos.push(e)
}

beforeEach(() => {
  avisos.length = 0
})

describe("cuando la base responde", () => {
  it("lee de la base y no toca el respaldo", async () => {
    const repo = new ResilientProductRepository(fake("base"), fake("json"), avisar)
    expect(await repo.listBrands()).toBe("base")
    expect(avisos).toEqual([])
  })
})

describe("sin DATABASE_URL", () => {
  it("sirve el catálogo desde el JSON sin avisar de nada", async () => {
    const repo = new ResilientProductRepository(null, fake("json"), avisar)
    expect(await repo.listCategories()).toBe("json")
    // No es una degradación: es la configuración elegida.
    expect(avisos).toEqual([])
  })

  it("se niega a escribir desde el panel", async () => {
    const repo = new ResilientProductRepository(null, fake("json"), avisar)
    await expect(repo.applyAdminProductChange("slug", {}, "admin")).rejects.toThrow(
      AdminProductError,
    )
  })
})

describe("cuando la base falla", () => {
  it("cae al JSON en vez de romper la tienda", async () => {
    const repo = new ResilientProductRepository(fake("base", new Error("caida")), fake("json"), avisar)
    expect(await repo.listFeatured(8)).toBe("json")
  })

  // Es el fallo que dejo el bug de TLS invisible durante dias: la tienda
  // parecia sana porque el catalogo se servia igual.
  it("avisa de que ha degradado, con el motivo", async () => {
    const repo = new ResilientProductRepository(
      fake("base", new Error("server does not support TLS\nen alguna pila")),
      fake("json"),
      avisar,
    )
    await repo.listBrands()
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({ event: "catalog.degraded", level: "error" })
    expect(avisos[0]?.reason).toBe("server does not support TLS")
  })

  // Hay una lectura por render: avisar en cada una ahogaria el log.
  it("avisa una sola vez mientras siga degradado", async () => {
    const repo = new ResilientProductRepository(fake("base", new Error("caida")), fake("json"), avisar)
    await repo.listBrands()
    await repo.listCategories()
    await repo.listFeatured(8)
    expect(avisos).toHaveLength(1)
  })

  it("avisa de nuevo cuando la base vuelve", async () => {
    let roto = true
    const intermitente = {
      listBrands: async () => {
        if (roto) throw new Error("caida")
        return "base" as never
      },
    } as unknown as ProductRepository

    const repo = new ResilientProductRepository(intermitente, fake("json"), avisar)
    await repo.listBrands()
    roto = false
    expect(await repo.listBrands()).toBe("base")

    expect(avisos.map((a) => a.event)).toEqual(["catalog.degraded", "catalog.restored"])
  })

  it("no degrada las escrituras del panel: fallan y se ven", async () => {
    const repo = new ResilientProductRepository(
      fake("base", new Error("caida")),
      fake("json"),
      avisar,
    )
    await expect(repo.applyAdminProductChange("slug", {}, "admin")).rejects.toThrow("caida")
  })
})

describe("aviso por defecto", () => {
  it("escribe una linea JSON en la consola", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {})
    const repo = new ResilientProductRepository(fake("base", new Error("caida")), fake("json"))
    await repo.listBrands()

    expect(espia).toHaveBeenCalledOnce()
    const linea = JSON.parse(String(espia.mock.calls[0]?.[0])) as Record<string, unknown>
    expect(linea.event).toBe("catalog.degraded")
    expect(linea.ts).toBeTypeOf("string")
    espia.mockRestore()
  })
})
