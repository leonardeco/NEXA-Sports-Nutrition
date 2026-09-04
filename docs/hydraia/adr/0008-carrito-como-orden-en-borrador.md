# ADR-0008 — El carrito es una orden en borrador

- **Estado:** Aceptada
- **Fecha:** 2026-09-03

## Contexto

El ADS §6.3 no define una tabla `carts`, pero sí incluye `DRAFT` en el enum `OrderStatus`
y como valor por defecto de `orders.status`. Al implementar F2 había que resolver la
ambigüedad: o el carrito era una entidad propia que se convierte en orden al pagar, o el
carrito ya era una orden desde el primer clic en "añadir".

RF-05 exige además que el carrito se persista en el servidor asociado a la sesión, no en
el navegador: el stock y el precio se validan contra la base, así que un carrito que solo
viva en `localStorage` no sirve.

## Decisión

**El carrito es una orden en estado `DRAFT`.** El checkout no crea nada: es la transición
`DRAFT → PENDING_PAYMENT`.

- Las líneas del carrito son filas de `order_items` desde el principio.
- `DRAFT` **no reserva stock**. Solo `PENDING_PAYMENT` lo hace (RF-08).
- Mientras la orden esté en `DRAFT`, los snapshots de `order_items` no mandan: el precio
  y el stock que se muestran y se suman salen de la variante viva. Los snapshots se
  congelan en el checkout, que es el instante en que el precio deja de poder moverse.
- Una sesión tiene como mucho un carrito, garantizado por un índice único sobre
  `orders.draft_session_id`, columna que vale lo mismo que `session_id` mientras la orden
  es el carrito y pasa a `NULL` en el checkout.

La sesión anónima es un identificador opaco en cookie `httpOnly`, nunca el id de la orden.

## Alternativas consideradas

**Tabla `carts` propia con `cart_items`.** Semánticamente más limpia —un carrito no es un
pedido— y evita que `orders` se llene de borradores abandonados. Se descartó porque
contradice el modelo aprobado del ADS y duplicaría la lógica de líneas, importes e
inventario en dos sitios que tienen que dar el mismo resultado. Cuando dos caminos
calculan dinero, tarde o temprano dejan de coincidir.

**Carrito en el cliente, orden solo al pagar.** Es lo que hacía LEOFIT. Incumple RF-05 y
deja la validación de stock para el último momento, que es cuando peor sienta descubrir
que no hay.

**`@@unique([sessionId, status])` en lugar de la columna aparte.** No sirve: después del
checkout la orden conserva su `session_id`, así que un carrito nuevo de la misma sesión
chocaría con la orden ya cursada. Lo que hace falta es un índice único *parcial*
—único solo mientras `status = 'DRAFT'`— y Prisma no sabe declararlos. Codificar la
condición en el dato es la forma de expresarlo sin salirse del ORM.

## Consecuencias

**A favor:** un solo modelo de líneas e importes, un solo camino de cálculo. El checkout
es una transición de estado y no una copia de datos entre tablas, así que no puede perder
ni duplicar líneas por el camino. El asistente de F4 podrá añadir al carrito usando
exactamente el mismo repositorio que la web.

**En contra:** `orders` acumula borradores abandonados, y cada uno consume un
`order_number` de una secuencia que el cliente ve. Con el tráfico previsto —decenas de
pedidos al mes— es irrelevante, pero conviene un borrado periódico de borradores sin
actividad. La consulta del panel excluye `DRAFT` por defecto para que no ensucien la
operación.

Relacionada: [[0004-inventario-como-libro-de-movimientos]], [[0007-dinero-en-centavos]]
