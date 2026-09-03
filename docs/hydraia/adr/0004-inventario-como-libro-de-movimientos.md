# ADR-0004 — Inventario como libro de movimientos, no como contador

- **Estado:** Aceptada
- **Fecha:** 2026-09-02

## Contexto

En el sistema actual `stock` es un número dentro de `productos.json` que nunca se
modifica: se puede vender indefinidamente algo que no existe. Al introducir pagos reales,
esto deja de ser un detalle y pasa a ser una fuente de pérdidas y de reembolsos.

## Decisión

El inventario se modela como un **libro de movimientos append-only**
(`inventory_movements`), no como una columna que se suma y se resta.

- Cada cambio inserta una fila con `delta`, `reason`, `order_id` y `created_at`.
- `reason ∈ { RESTOCK, SALE, RESERVATION, RESERVATION_RELEASE, ADJUSTMENT, RETURN }`.
- El stock disponible es la suma de los `delta`, cacheada en `product_variants.stock` para
  lectura rápida.
- Al crear una orden se inserta un movimiento `RESERVATION` con `expires_at` a 30 minutos.
- Al confirmarse el pago: `RESERVATION_RELEASE` + `SALE`, en la misma transacción que el
  cambio de estado de la orden.
- Si la reserva expira sin pago: `RESERVATION_RELEASE` y orden a `EXPIRED`.
- La lectura de stock durante el checkout usa `SELECT … FOR UPDATE` sobre la variante.

## Alternativas consideradas

**Columna `stock` con `UPDATE`.** Más simple, pero no responde "¿por qué faltan tres
unidades?" y expone a carreras entre dos compras simultáneas del último ítem.

**Reserva en Redis con TTL.** Más rápida, pero pone el estado del inventario fuera de la
transacción de base de datos: se puede confirmar un pago cuya reserva ya se evaporó.

## Consecuencias

**A favor:** todo faltante es explicable y auditable. La sobreventa se vuelve
estructuralmente imposible, no algo que se evita con cuidado. Los reintentos de webhook no
descuentan dos veces, porque el `SALE` va ligado al `order_id`.

**En contra:** más filas y más complejidad de escritura. Requiere un job que libere
reservas vencidas. El caché en `product_variants.stock` puede desincronizarse: se añade
una comprobación de consistencia periódica que compara el caché con la suma real.

Relacionada: [[0003-wompi-webhook-idempotente]]
