import { AdminProductError, type ProductRepository } from "@nexa/core"

/** Cómo se avisa de que el catálogo dejó de leerse de la base. */
export type AvisoDegradacion = (entrada: {
  readonly event: string
  readonly level: "warn" | "error"
  readonly reason?: string
}) => void

const avisoPorDefecto: AvisoDegradacion = (entrada) => {
  const linea = JSON.stringify({ ts: new Date().toISOString(), ...entrada })
  if (entrada.level === "error") console.error(linea)
  else console.warn(linea)
}

/**
 * Lee Neon si hay DATABASE_URL; si no, o si la consulta falla, el JSON del
 * repo (el mismo patrón que sports-store). Escrituras de admin no degradan.
 *
 * El `catch` de aquí abajo estuvo mudo y salió caro: cuando la aplicación
 * no podía hablar con PostgreSQL —forzaba TLS contra una base que no lo
 * soporta— el catálogo se seguía sirviendo desde el JSON y la tienda
 * parecía sana. El fallo solo asomaba al añadir algo al carrito, que no
 * tiene respaldo, tres pasos más tarde y sin relación aparente.
 *
 * Ahora degradar deja rastro. Se avisa al entrar en degradación y al
 * recuperarse, no en cada consulta: con una lectura por render, registrar
 * cada fallo ahogaría el log y nadie lo leería.
 */
export class ResilientProductRepository implements ProductRepository {
  private degradado = false

  constructor(
    private readonly live: ProductRepository | null,
    private readonly fallback: ProductRepository,
    private readonly avisar: AvisoDegradacion = avisoPorDefecto,
  ) {}

  private async read<T>(run: (repo: ProductRepository) => Promise<T>): Promise<T> {
    if (!this.live) return run(this.fallback)

    try {
      const resultado = await run(this.live)
      if (this.degradado) {
        this.degradado = false
        this.avisar({ event: "catalog.restored", level: "warn" })
      }
      return resultado
    } catch (error) {
      if (!this.degradado) {
        this.degradado = true
        this.avisar({
          event: "catalog.degraded",
          level: "error",
          // Solo la primera linea: los errores de Prisma traen la pila entera
          // y aqui interesa el motivo, no el rastro.
          reason:
            error instanceof Error
              ? (error.message.split("\n")[0] ?? error.message)
              : String(error),
        })
      }
      return run(this.fallback)
    }
  }

  findBySlug(slug: string) {
    return this.read((repo) => repo.findBySlug(slug))
  }

  findById(id: string) {
    return this.read((repo) => repo.findById(id))
  }

  findBySlugForAdmin(slug: string) {
    return this.read((repo) => repo.findBySlugForAdmin(slug))
  }

  search(query: Parameters<ProductRepository["search"]>[0], embedding?: Parameters<ProductRepository["search"]>[1]) {
    return this.read((repo) => repo.search(query, embedding))
  }

  listForAdmin(query: Parameters<ProductRepository["listForAdmin"]>[0]) {
    return this.read((repo) => repo.listForAdmin(query))
  }

  listFeatured(limit: number) {
    return this.read((repo) => repo.listFeatured(limit))
  }

  listBrands() {
    return this.read((repo) => repo.listBrands())
  }

  listCategories() {
    return this.read((repo) => repo.listCategories())
  }

  // `async` a proposito: el puerto promete una promesa, y lanzar de forma
  // sincrona desde aqui hacia que un `.catch()` del llamante no atrapara
  // nada. Con `async` el fallo siempre llega como rechazo.
  async applyAdminProductChange(
    ...args: Parameters<ProductRepository["applyAdminProductChange"]>
  ) {
    if (!this.live) {
      throw new AdminProductError("El panel de productos necesita DATABASE_URL")
    }
    return this.live.applyAdminProductChange(...args)
  }
}
