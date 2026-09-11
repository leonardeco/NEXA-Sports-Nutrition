// ─────────────────────────────────────────────────────────────────────────
//  Genera embeddings del catálogo — ADR-0010
//
//    pnpm db:embed
//
//  Idempotente: upsert por productId. Sin VOYAGE_API_KEY no escribe nada.
// ─────────────────────────────────────────────────────────────────────────

import { vectorLiteral } from "@nexa/core"
import { Prisma } from "../generated/client/index.js"
import { prisma } from "../src/index.js"
import { embedTexts, productEmbeddingText, voyageConfigured } from "../src/embeddings/voyage.js"

async function main(): Promise<void> {
  if (!voyageConfigured()) {
    console.warn("VOYAGE_API_KEY no está configurada: no se generan embeddings (RNF-03).")
    return
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { brand: true, category: true },
    orderBy: { name: "asc" },
  })
  if (products.length === 0) {
    console.warn("No hay productos activos que embeber.")
    return
  }

  const texts = products.map((product) =>
    productEmbeddingText({
      name: product.name,
      brand: product.brand.name,
      category: product.category.name,
      description: product.description,
      benefits: product.benefits,
    }),
  )

  const vectors = await embedTexts(texts, "document")
  if (!vectors) {
    throw new Error("Voyage no devolvió embeddings. Revisa la clave y el modelo.")
  }

  for (let i = 0; i < products.length; i += 1) {
    const product = products[i]
    const vector = vectors[i]
    if (!product || !vector) continue
    const literal = vectorLiteral(vector)
    await prisma.$executeRaw`
      INSERT INTO product_embeddings ("productId", embedding, "updatedAt")
      VALUES (${product.id}, ${Prisma.raw(`'${literal}'::vector`)}, NOW())
      ON CONFLICT ("productId")
      DO UPDATE SET embedding = EXCLUDED.embedding, "updatedAt" = NOW()
    `
  }

  process.stdout.write(`ok embeddings ${products.length}\n`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
