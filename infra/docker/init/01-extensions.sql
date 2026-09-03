-- Extensiones que el esquema de Prisma declara en `datasource.extensions`.
-- Se crean al inicializar el volumen por primera vez.
--
--   vector    → búsqueda semántica del asistente (ADR-0005)
--   pg_trgm   → coincidencia aproximada en la búsqueda de catálogo
--   unaccent  → que "proteina" encuentre "proteína"

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Configuración de búsqueda en español sin acentos, para el `tsvector` de
-- products. Se usa desde las migraciones de F1.
--
-- PostgreSQL no admite IF NOT EXISTS en CREATE TEXT SEARCH CONFIGURATION,
-- así que se comprueba a mano para que el script sea idempotente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'es_nexa') THEN
    CREATE TEXT SEARCH CONFIGURATION es_nexa (COPY = spanish);
    ALTER TEXT SEARCH CONFIGURATION es_nexa
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, spanish_stem;
  END IF;
END
$$;
