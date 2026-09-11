import { describe, expect, it } from "vitest"
import {
  EMBEDDING_DIMENSIONS,
  assertEmbedding,
  embeddingSource,
  reciprocalRankFusion,
  vectorLiteral,
} from "./search"

describe("reciprocalRankFusion", () => {
  it("sube un id que aparece en texto y en semántica", () => {
    const fused = reciprocalRankFusion([
      ["text-only", "both", "text-2"],
      ["sem-only", "both", "sem-2"],
    ])
    expect(fused[0]).toBe("both")
    expect(fused).toContain("text-only")
    expect(fused).toContain("sem-only")
  })

  it("con una sola lista conserva el orden", () => {
    expect(reciprocalRankFusion([["a", "b", "c"]])).toEqual(["a", "b", "c"])
  })

  it("ignora listas vacías", () => {
    expect(reciprocalRankFusion([[], ["x"]])).toEqual(["x"])
  })
})

describe("embeddingSource", () => {
  it("concatena nombre, marca, categoría y textos de ficha", () => {
    expect(
      embeddingSource({
        name: "Nitro Tech",
        brand: "MuscleTech",
        category: "Proteínas",
        description: "Whey aislada",
        benefits: "Recuperación",
      }),
    ).toBe("Nitro Tech. MuscleTech. Proteínas. Whey aislada. Recuperación")
  })

  it("omite nulos", () => {
    expect(
      embeddingSource({
        name: "Creatina",
        brand: "NEXA",
        category: "Creatinas",
        description: null,
        benefits: null,
      }),
    ).toBe("Creatina. NEXA. Creatinas")
  })
})

describe("vectorLiteral", () => {
  it("exige 1024 dimensiones finitas", () => {
    expect(() => vectorLiteral([1, 2, 3])).toThrow(/1024/)
    expect(() => assertEmbedding(Array.from({ length: EMBEDDING_DIMENSIONS }, () => Number.NaN))).toThrow(
      /finito/,
    )
  })

  it("serializa el literal que espera pgvector", () => {
    const values = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 0.5 : 0))
    expect(vectorLiteral(values).startsWith("[0.5,")).toBe(true)
    expect(vectorLiteral(values).endsWith("0]")).toBe(true)
  })
})
