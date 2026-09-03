import js from "@eslint/js"
import tseslint from "typescript-eslint"
import globals from "globals"

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "packages/db/generated/**",
      "packages/db/prisma/migrations/**",
      // Lo genera Next en cada build y usa referencias triple-slash.
      "**/next-env.d.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  //  Constitución, principio 2 · ADR-0001
  //  El dominio no conoce el framework. Esta regla es lo que convierte esa
  //  frase en algo verificable: si `packages/core` importa Next, Prisma o
  //  React, el lint falla y el PR no entra.
  //  Es la puerta de salida que permite extraer el dominio a un servicio
  //  propio sin reescribir lógica de negocio.
  // ────────────────────────────────────────────────────────────────────────
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*"],
              message:
                "packages/core no puede depender de Next.js. Define un puerto aquí y ponle el adaptador en apps/web (ADR-0001).",
            },
            {
              group: ["@prisma/client", "@prisma/client/*", "@nexa/db", "@nexa/db/*"],
              message:
                "packages/core no puede depender de Prisma. Define un puerto de repositorio aquí e impleméntalo en packages/db (ADR-0001).",
            },
            {
              group: ["react", "react-dom", "react/*", "react-dom/*", "@nexa/ui", "@nexa/ui/*"],
              message:
                "packages/core es dominio puro: nada de UI (ADR-0001).",
            },
            {
              group: ["@anthropic-ai/*", "stripe", "axios"],
              message:
                "Los SDK de terceros van en adaptadores, no en el dominio (ADR-0001).",
            },
          ],
        },
      ],
    },
  },

  // El código de servidor de la web sí puede tocar la base de datos.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
)
