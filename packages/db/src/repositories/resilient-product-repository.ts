import { AdminProductError, type ProductRepository } from "@nexa/core"

/**
 * Lee Neon si hay DATABASE_URL; si no, o si la consulta falla, el JSON del
 * repo (el mismo patrón que sports-store). Escrituras de admin no degradan.
 */
export class ResilientProductRepository implements ProductRepository {
  constructor(
    private readonly live: ProductRepository | null,
    private readonly fallback: ProductRepository,
  ) {}

  private async read<T>(run: (repo: ProductRepository) => Promise<T>): Promise<T> {
    if (!this.live) return run(this.fallback)
    try {
      return await run(this.live)
    } catch {
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

  applyAdminProductChange(
    ...args: Parameters<ProductRepository["applyAdminProductChange"]>
  ) {
    if (!this.live) {
      throw new AdminProductError("El panel de productos necesita DATABASE_URL")
    }
    return this.live.applyAdminProductChange(...args)
  }
}
