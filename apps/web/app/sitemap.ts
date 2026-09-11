import type { MetadataRoute } from "next"
import { productRepository } from "@nexa/db"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ items }, categories, brands] = await Promise.all([
    productRepository.search({ limit: 200 }),
    productRepository.listCategories(),
    productRepository.listBrands(),
  ])

  const now = new Date()

  return [
    { url: siteUrl, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/catalogo`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/contacto`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    ...categories.map((c) => ({
      url: `${siteUrl}/catalogo?categoria=${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...brands.map((b) => ({
      url: `${siteUrl}/catalogo?marca=${b.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...items.map((p) => ({
      url: `${siteUrl}/producto/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ]
}
