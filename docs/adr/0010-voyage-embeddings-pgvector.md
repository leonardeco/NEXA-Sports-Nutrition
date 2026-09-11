# ADR-0010 — Embeddings con Voyage y pgvector

- **Estado:** Aceptada
- **Fecha:** 2026-09-11

## Contexto

RF-03 y ADR-0005 piden búsqueda híbrida: texto en español más similitud semántica.
La tabla `product_embeddings` ya existe con `vector(1024)`. Falta quién genera esos
vectores. Anthropic no ofrece embeddings. Inventar un vector a partir de hashes no
es búsqueda semántica.

## Decisión

**Voyage `voyage-3`** (1024 dimensiones, cosine) para indexar
`nombre + marca + categoría + descripción + beneficios` y para embeber la consulta.

- Los vectores se guardan en Postgres (`pgvector`). No hay un motor de búsqueda aparte
  (ADR-0002).
- La fusión de resultados es *reciprocal rank fusion* en el dominio, no un score
  opaco de un SaaS.
- Sin `VOYAGE_API_KEY` la tienda no se cae (RNF-03): el catálogo y el asistente
  siguen con `searchText`. `pnpm db:embed` no escribe nada.

La generación no va en el seed de CI: CI no tiene la clave y no debe llamar a un
proveedor externo. Se corre a mano o en un job cuando hay clave.

## Alternativas consideradas

**OpenAI `text-embedding-3-small`.** 1536 dimensiones: habría que cambiar el
esquema. Otro proveedor más, sin relación con el asistente.

**Modelo local (`transformers`).** Cero coste por consulta, pero no cabe en una
función de Vercel y alarga el build.

**Solo `searchText` / `pg_trgm`.** No cumple RF-03: "proteína para recuperar" no
encuentra un whey si esas palabras no están en la ficha.

## Consecuencias

**A favor:** la dimensión ya estaba en el esquema. Voyage es el embedding que
Anthropic recomienda junto a Claude. Una clave más, degradación limpia.

**En contra:** coste por reindexado (~127 textos, una vez y cuando cambie el
catálogo) y una dependencia de red en la primera búsqueda de cada término
(mitigado por el cache de 120 s del catálogo).

Relacionada: [[0002-postgresql-prisma-neon]], [[0005-bot-con-herramientas-de-dominio]]
