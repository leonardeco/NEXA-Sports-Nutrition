# ADR-0002 — PostgreSQL + Prisma + Neon con branching por PR

- **Estado:** Aceptada
- **Fecha:** 2026-09-02

## Contexto

Los 127 productos viven hoy en un archivo JSON versionado. Se necesita persistencia
transaccional para órdenes, pagos e inventario, además de búsqueda en español y búsqueda
semántica para el asistente de ventas.

## Decisión

**PostgreSQL 17** como única base de datos, con **Prisma** como ORM y cliente tipado, y
**Neon** como proveedor gestionado en la nube.

- Desarrollo local: `postgres:17-alpine` con la extensión `pgvector` vía Docker Compose.
- Producción y previews: Neon, con connection pooling.
- Búsqueda: `tsvector` con configuración `spanish` para texto, `pgvector` para similitud
  semántica. Sin motor de búsqueda externo en v1.

## Alternativas consideradas

**Supabase.** Aporta auth y storage integrados, pero arrastra Row Level Security y un
modelo de acceso desde el cliente que choca con la regla de que el servidor es la única
fuente de verdad (constitución, principio 3).

**Postgres gestionado convencional (RDS, Railway).** Válido, pero sin branching de base
de datos.

**MongoDB.** Rechazada: el dominio es fuertemente relacional (órdenes, ítems, movimientos
de inventario) y necesita transacciones multi-tabla para no vender stock inexistente.

## Consecuencias

**A favor:** cada PR obtiene una rama de base de datos con datos reales; CI corre
migraciones contra ella y se destruye al hacer merge. Esto convierte las migraciones en
algo revisable en vez de algo que se descubre en producción. `pgvector` evita añadir una
base de datos vectorial aparte.

**En contra:** el plan gratuito de Neon suspende la base tras inactividad, con un cold
start visible en la primera visita (mitigado con ISR en el catálogo). Prisma requiere el
adaptador serverless o la cadena de conexión con pool para funcionar bien en funciones
efímeras.

Relacionada: [[0004-inventario-como-libro-de-movimientos]], [[0005-bot-con-herramientas-de-dominio]]
