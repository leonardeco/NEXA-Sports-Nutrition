import { afterEach, describe, expect, it, vi } from "vitest"
import { embedQuery, voyageConfigured } from "./voyage"

describe("voyageConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("es falso sin clave", () => {
    vi.stubEnv("VOYAGE_API_KEY", "")
    expect(voyageConfigured()).toBe(false)
  })

  it("es verdadero con clave", () => {
    vi.stubEnv("VOYAGE_API_KEY", "vk-test")
    expect(voyageConfigured()).toBe(true)
  })
})

describe("embedQuery", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("devuelve null si no hay clave, sin llamar a la red", async () => {
    vi.stubEnv("VOYAGE_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await embedQuery("creatina")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
