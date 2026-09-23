# ADR-0011 — PostgreSQL 17 o superior, y la versión de producción manda

- **Estado:** Aceptada
- **Fecha:** 2026-09-22
- **Enmienda a:** [ADR-0002](0002-postgresql-prisma-neon.md), solo en la versión mínima

## Contexto

ADR-0002 fijó **PostgreSQL 17** y el principio 1 de la constitución lo recogió como regla
permanente. La realidad se fue por otro lado dos veces:

1. El proyecto de Neon arrancó con **16.15**, por debajo de lo escrito. Se acordó migrar.
2. Neon no actualiza la versión mayor en sitio, así que migrar significó crear un proyecto
   nuevo y resembrar. El proyecto nuevo (`ep-noisy-snow-b5nev193`) quedó en **18.6**, una
   versión por encima de lo escrito.

Durante días el sistema funcionó incumpliendo su propia constitución, primero por debajo y
luego por arriba. Una regla que se incumple sin consecuencia deja de ser una regla.

Aparte, CI, el `docker-compose` y los manifiestos de Kubernetes seguían en `pg17`: los
tests de integración nunca habían visto la versión mayor que de verdad sirve los pedidos.

## Decisión

La versión mínima pasa a ser **PostgreSQL 17 o superior**, y el resto de entornos se
alinea con la versión que corre en producción.

- Constitución, principio 1: "Prisma sobre PostgreSQL 17 o superior".
- CI, `docker-compose` y los manifiestos de `infra/k8s` usan la imagen de la versión mayor
  que corre en producción. Hoy `pgvector/pgvector:pg18`.
- Subir la versión mayor de producción no exige un ADR nuevo mientras sea 17 o superior;
  sí exige alinear los demás entornos en el mismo cambio.

## Alternativas consideradas

**Bajar Neon a 17 para cumplir lo escrito.** Es lo que la constitución pedía al pie de la
letra. Se rechaza porque implica crear otro proyecto y resembrar por tercera vez, para
acabar en una versión más vieja que la que ya funciona con 128 productos, pgvector y el
flujo de compra verificado. Sería obedecer la regla a costa del sistema.

**Fijar exactamente la 18.** Vuelve a poner un número concreto en una regla permanente y
garantiza repetir este mismo ADR la próxima vez que Neon suba de versión.

**Dejar la desviación abierta y documentada.** Es lo que había, y es la peor: normaliza
que la constitución no se cumpla.

## Consecuencias

**A favor:** la constitución vuelve a ser cierta. El suelo sigue habiendo —nada por debajo
de 17, así que las funciones y tipos que usa el esquema están garantizados—, pero deja de
prohibir versiones más nuevas por el mero hecho de serlo. Y alinear CI con producción cierra
un agujero real: hasta ahora los 31 tests de integración validaban contra una versión mayor
distinta de la que atiende a los clientes.

**En contra:** "o superior" es una promesa de compatibilidad hacia adelante que nadie ha
verificado. Una versión mayor futura puede romper algo de pgvector, `unaccent` o el
`tsvector` en español. La protección es que CI corre contra la misma imagen que producción,
así que el fallo aparecería en el pipeline antes que en la tienda — pero solo si alguien se
acuerda de subir las dos a la vez, que es justo lo que esta decisión obliga.

Relacionada: [[0002-postgresql-prisma-neon]], [[0010-voyage-embeddings-pgvector]]
