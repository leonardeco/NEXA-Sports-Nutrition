// ─────────────────────────────────────────────────────────────────────────
//  Dinero — ADR-0007
//
//  Todo importe se almacena y se opera como entero de CENTAVOS, que es el
//  formato exacto que exige Wompi en `amount_in_cents` y en su firma de
//  integridad. Convertir en cada llamada abre la puerta a errores de factor
//  100: en un sentido la firma no valida, en el otro se cobra cien veces de
//  más.
//
//  El tipo `Cents` va marcado para que un `number` suelto no pueda pasar por
//  un importe sin querer.
// ─────────────────────────────────────────────────────────────────────────

declare const centsBrand: unique symbol

/** Entero de centavos de peso colombiano. Se construye solo vía `Money`. */
export type Cents = number & { readonly [centsBrand]: true }

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MoneyError"
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${label} debe ser un número finito, se recibió ${value}`)
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} debe ser un entero de centavos, se recibió ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} excede el rango de enteros seguros`)
  }
}

const formatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

export const Money = {
  /** Cero pesos. */
  zero(): Cents {
    return 0 as Cents
  },

  /** Construye desde centavos ya validados (p. ej. lo que viene de la base). */
  fromCents(value: number): Cents {
    assertSafeInteger(value, "El importe")
    return value as Cents
  },

  /**
   * Construye desde pesos enteros. Es la vía para migrar los precios legacy
   * de `productos.json`, que están en pesos: 185000 → 18 500 000 centavos.
   */
  fromCOP(pesos: number): Cents {
    assertSafeInteger(pesos, "El importe en pesos")
    return (pesos * 100) as Cents
  },

  /** Pesos enteros, redondeando al peso más cercano. Solo para presentación. */
  toCOP(value: Cents): number {
    return Math.round(value / 100)
  },

  add(a: Cents, b: Cents): Cents {
    return Money.fromCents(a + b)
  },

  subtract(a: Cents, b: Cents): Cents {
    return Money.fromCents(a - b)
  },

  /** Precio unitario por cantidad. La cantidad debe ser un entero positivo. */
  multiply(unit: Cents, quantity: number): Cents {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new MoneyError(`La cantidad debe ser un entero no negativo, se recibió ${quantity}`)
    }
    return Money.fromCents(unit * quantity)
  },

  sum(values: readonly Cents[]): Cents {
    return values.reduce<Cents>((acc, v) => Money.add(acc, v), Money.zero())
  },

  /**
   * Aplica un porcentaje de descuento redondeando hacia abajo, de modo que el
   * descuento nunca supere lo anunciado.
   */
  percentage(value: Cents, percent: number): Cents {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new MoneyError(`El porcentaje debe estar entre 0 y 100, se recibió ${percent}`)
    }
    return Money.fromCents(Math.floor((value * percent) / 100))
  },

  isZero(value: Cents): boolean {
    return value === 0
  },

  /** "$ 185.000" — formato es-CO sin decimales. */
  format(value: Cents): string {
    return formatter.format(Money.toCOP(value))
  },
} as const
