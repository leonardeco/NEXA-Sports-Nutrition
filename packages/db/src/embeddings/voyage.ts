// ─────────────────────────────────────────────────────────────────────────
//  Adaptador Voyage — ADR-0010
//
//  Única pieza que habla con api.voyageai.com. Sin clave no lanza: devuelve
//  null y la búsqueda se queda en texto (RNF-03).
// ─────────────────────────────────────────────────────────────────────────

import { EMBEDDING_DIMENSIONS, assertEmbedding, embeddingSource } from "@nexa/core"

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
const BATCH = 64

export type VoyageInputType = "document" | "query"

export function voyageConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY?.trim())
}

export function voyageModel(): string {
  return process.env.NEXA_EMBED_MODEL?.trim() || "voyage-3"
}

export async function embedTexts(
  texts: readonly string[],
  inputType: VoyageInputType,
): Promise<number[][] | null> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim()
  if (!apiKey || texts.length === 0) return null

  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: voyageModel(),
        input: batch,
        input_type: inputType,
      }),
    })
    if (!response.ok) {
      console.warn(`[voyage] HTTP ${response.status} al pedir embeddings`)
      return null
    }
    const body = (await response.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>
    }
    const rows = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    if (rows.length !== batch.length) {
      console.warn("[voyage] la respuesta no cubre el lote")
      return null
    }
    for (const row of rows) {
      if (!row.embedding) return null
      out.push([...assertEmbedding(row.embedding)])
    }
  }
  return out
}

export async function embedQuery(text: string): Promise<readonly number[] | null> {
  const trimmed = text.trim()
  if (!trimmed) return null
  const batch = await embedTexts([trimmed], "query")
  return batch?.[0] ?? null
}

export function productEmbeddingText(input: {
  readonly name: string
  readonly brand: string
  readonly category: string
  readonly description: string | null
  readonly benefits: string | null
}): string {
  return embeddingSource(input)
}

export { EMBEDDING_DIMENSIONS }
