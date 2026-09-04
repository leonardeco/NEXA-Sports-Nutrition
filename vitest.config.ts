import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "apps/**/lib/**/*.test.ts"],
    // Los `.integration.test.ts` necesitan una base real y corren aparte,
    // con `pnpm test:integration`. Así `pnpm test` sigue siendo instantáneo
    // y no depende de que haya PostgreSQL delante.
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/generated/**",
      "**/*.integration.test.ts",
    ],
  },
})
