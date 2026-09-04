import { defineConfig } from "vitest/config"

/**
 * Tests que hablan con PostgreSQL de verdad. Prueban lo que un test unitario
 * no puede: que la transacción, el bloqueo `FOR UPDATE` y el índice único
 * hacen lo que se espera de ellos.
 *
 * Van en serie y sin timeout corto: cada caso mueve stock real del catálogo
 * sembrado y lo deja como estaba.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/generated/**"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
