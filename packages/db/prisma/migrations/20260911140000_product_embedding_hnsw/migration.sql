-- Índice cosine para la búsqueda semántica (ADR-0010).
-- HNSW admite tabla vacía; los NULL de embedding no se indexan.
CREATE INDEX IF NOT EXISTS "product_embeddings_embedding_idx"
ON "product_embeddings"
USING hnsw (embedding vector_cosine_ops);
