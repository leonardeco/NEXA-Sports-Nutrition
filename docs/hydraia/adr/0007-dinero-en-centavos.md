# ADR-0007 — Dinero almacenado en centavos enteros

- **Estado:** Aceptada
- **Fecha:** 2026-09-02

## Contexto

El sistema actual guarda precios como pesos enteros (`"precio": 185000`) y los formatea
con `Intl.NumberFormat("es-CO")`. Wompi, en cambio, exige los importes en **centavos**
(`amount_in_cents`) y los incluye en la firma de integridad que valida cada transacción.

## Decisión

Todo importe monetario se almacena como **entero en centavos** (`BIGINT`), con el sufijo
`_cents` en el nombre de la columna: `price_cents`, `subtotal_cents`, `total_cents`,
`amount_cents`.

- La conversión a pesos ocurre solo en la capa de presentación.
- El formateo sigue usando `Intl.NumberFormat("es-CO", { currency: "COP",
  maximumFractionDigits: 0 })`.
- Se prohíbe `float` y `double` para dinero en cualquier capa.
- La migración multiplica los precios legacy por 100.

## Alternativas consideradas

**Pesos enteros (formato actual).** Más natural para COP, que en la práctica no usa
centavos. Rechazada porque obligaría a convertir en cada llamada a Wompi y en cada
verificación de firma: un error de factor 100 en la firma produce transacciones rechazadas
difíciles de diagnosticar, y un error en sentido contrario cobra cien veces de más.

**`DECIMAL(12,2)`.** Correcto aritméticamente, pero introduce tipos decimales que
JavaScript no representa de forma nativa y obliga a una librería de precisión en el
cliente de Prisma.

## Consecuencias

**A favor:** la representación interna coincide exactamente con la del proveedor de pagos.
La aritmética de carrito, descuentos y totales es entera, sin errores de coma flotante. El
sufijo `_cents` hace visible la unidad en cada punto del código.

**En contra:** todo desarrollador debe recordar la unidad. Mitigación: un tipo
`Money` en `packages/core` que envuelve el entero y expone `fromCOP()`, `toCOP()` y
`format()`, de modo que multiplicar o dividir por 100 a mano deje de ser necesario.

Relacionada: [[0003-wompi-webhook-idempotente]]
