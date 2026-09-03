import { describe, expect, it } from "vitest"
import { Money, MoneyError } from "./money"

describe("Money", () => {
  describe("construcción", () => {
    it("convierte pesos legacy a centavos", () => {
      // El precio de Nitro Tech 2 LBS en productos.json
      expect(Money.fromCOP(185_000)).toBe(18_500_000)
    })

    it("acepta centavos directos", () => {
      expect(Money.fromCents(18_500_000)).toBe(18_500_000)
    })

    it("rechaza importes fraccionarios", () => {
      expect(() => Money.fromCents(1500.5)).toThrow(MoneyError)
    })

    it("rechaza NaN e infinito", () => {
      expect(() => Money.fromCents(Number.NaN)).toThrow(MoneyError)
      expect(() => Money.fromCents(Number.POSITIVE_INFINITY)).toThrow(MoneyError)
    })

    it("rechaza importes fuera del rango de enteros seguros", () => {
      expect(() => Money.fromCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError)
    })
  })

  describe("aritmética", () => {
    it("suma sin error de coma flotante", () => {
      // 0.1 + 0.2 en pesos daría 0.30000000000000004 con floats
      const total = Money.add(Money.fromCents(10), Money.fromCents(20))
      expect(total).toBe(30)
    })

    it("multiplica precio unitario por cantidad", () => {
      const linea = Money.multiply(Money.fromCOP(185_000), 3)
      expect(Money.toCOP(linea)).toBe(555_000)
    })

    it("permite cantidad cero", () => {
      expect(Money.multiply(Money.fromCOP(185_000), 0)).toBe(0)
    })

    it("rechaza cantidades negativas o fraccionarias", () => {
      const precio = Money.fromCOP(185_000)
      expect(() => Money.multiply(precio, -1)).toThrow(MoneyError)
      expect(() => Money.multiply(precio, 1.5)).toThrow(MoneyError)
    })

    it("suma una lista de líneas de pedido", () => {
      const lineas = [
        Money.multiply(Money.fromCOP(185_000), 2), // Nitro Tech 2 LBS
        Money.multiply(Money.fromCOP(300_000), 1), // Nitro Tech 4 LBS
        Money.multiply(Money.fromCOP(175_000), 1), // Whey Gold 2 LBS
      ]
      expect(Money.toCOP(Money.sum(lineas))).toBe(845_000)
    })

    it("suma una lista vacía a cero", () => {
      expect(Money.sum([])).toBe(0)
    })
  })

  describe("descuentos", () => {
    it("redondea hacia abajo para no descontar de más", () => {
      // 15% de 33.333 pesos = 4999,95 pesos → se corta, no se redondea arriba
      const descuento = Money.percentage(Money.fromCOP(33_333), 15)
      expect(descuento).toBe(499_995)
    })

    it("rechaza porcentajes fuera de rango", () => {
      const precio = Money.fromCOP(100_000)
      expect(() => Money.percentage(precio, -1)).toThrow(MoneyError)
      expect(() => Money.percentage(precio, 101)).toThrow(MoneyError)
    })
  })

  describe("presentación", () => {
    it("formatea en pesos colombianos sin decimales", () => {
      const texto = Money.format(Money.fromCOP(185_000))
      expect(texto).toContain("185")
      expect(texto).not.toContain(",00")
    })

    it("va y vuelve entre pesos y centavos sin perder valor", () => {
      expect(Money.toCOP(Money.fromCOP(185_000))).toBe(185_000)
    })
  })
})
