import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "apps/**/lib/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/generated/**"],
  },
})
