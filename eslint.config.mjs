import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generovaný klient Prismy (od kroku 1B) — nekontroluje se.
    "src/generated/**",
    // Výstupy automatických testů (Playwright).
    "e2e/vysledky/**",
    "e2e/zprava/**",
  ]),
]);

export default eslintConfig;
