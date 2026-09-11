import { afterEach, describe, expect, it, vi } from "vitest"
import { log } from "./log"

describe("log", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("escribe JSON con order_number (RNF-07)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    log({ event: "wompi.processed", order_number: "NEXA-260903-K7F2QX", status: "PAID" })
    const line = JSON.parse(spy.mock.calls[0]?.[0] as string) as {
      event: string
      order_number: string
      status: string
    }
    expect(line.event).toBe("wompi.processed")
    expect(line.order_number).toBe("NEXA-260903-K7F2QX")
    expect(line.status).toBe("PAID")
  })

  it("no deja secretos ni firmas en el registro", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    log({
      event: "wompi.rejected",
      level: "error",
      order_number: "NEXA-1",
      signature: "abc123",
      payload: { raw: "no" },
    })
    const printed = spy.mock.calls[0]?.[0] as string
    expect(printed).not.toContain("abc123")
    expect(printed).toContain("[redacted]")
    expect(printed).toContain("NEXA-1")
  })
})
