import { defineConfig } from "@playwright/test";

import ukazka from "./playwright.ukazka.config";

/**
 * Snímky pro README veřejné ukázky (krok 5D): tmavý vzhled, ukázkový
 * režim, vymyšlená data. Ukládají se do docs/snimky.
 *
 *   docker compose --profile test run --rm e2e npx playwright test -c playwright.snimky.config.ts
 */
export default defineConfig({
  ...ukazka,
  testDir: "./scripts/snimky",
  outputDir: "./scripts/snimky/vysledky",
  retries: 0,
  reporter: "list",
  projects: [{ name: "snimky" }],
});
