// ─────────────────────────────────────────────────────────────────────────
//  Fusión de búsquedas — RF-03, ADR-0010
//
//  El texto y el vector vienen de listas ya ordenadas (ids). Aquí no hay
//  SQL ni Voyage: solo reciprocal rank fusion, para poder testear que
//  "aparecer en las dos listas" gana a "aparecer en una".
// ─────────────────────────────────────────────────────────────────────────

const RRF_K = 60

/**
 * Combina listas ordenadas de ids. Un documento que sale en texto y en
 * semántica queda por encima de uno que solo sale en una.
 */
export function reciprocalRankFusion(
  rankedLists: readonly (readonly string[])[],
  k: number = RRF_K,
): string[] {
  const scores = new Map<string, number>()
  for (const list of rankedLists) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1))
    })
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)
}

export function embeddingSource(input: {
  readonly name: string
  readonly brand: string
  readonly category: string
  readonly description: string | null
  readonly benefits: string | null
}): string {
  return [input.name, input.brand, input.category, input.description, input.benefits]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(". ")
}

export const EMBEDDING_DIMENSIONS = 1024

export function assertEmbedding(values: readonly number[]): readonly number[] {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`El embedding debe tener ${EMBEDDING_DIMENSIONS} dimensiones, se recibieron ${values.length}`)
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("El embedding contiene un valor que no es finito")
  }
  return values
}

export function vectorLiteral(values: readonly number[]): string {
  assertEmbedding(values)
  return `[${values.join(",")}]`
}
