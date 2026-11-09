import { randomBytes } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

/**
 * Automatické testy v prohlížeči (Playwright), jako v CRM.
 *
 * Spouští se jen v Dockeru:
 *   docker compose --profile test run --rm e2e
 *
 * Testy běží proti vlastní aplikaci na portu 3100 nad databází v paměti
 * `portal_test` (služba db-test). Když adresa míří jinam, testy se
 * nespustí — vymazat vývojová data omylem nesmí jít.
 *
 * Desktop pouští všechno, telefony jen testy se štítkem @telefon.
 */
if (!process.env.DATABASE_URL?.endsWith("/portal_test")) {
  throw new Error("Testy smí běžet jen nad databází portal_test (docker compose --profile test).");
}

/*
 * Heslo ukázkových účtů je náhodné pro každý běh (Jakub, 7. 11. 2026).
 * Vymyslí se jednou v hlavním procesu; testovací server (seed) i jednotlivé
 * testy ho zdědí v prostředí.
 */
process.env.SEED_HESLO ||= randomBytes(18).toString("base64url");

const PORT = 3100;
const NA_TELEFONU = /@telefon/;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/vysledky",

  // Vývojový server překládá stránky až při prvním otevření.
  timeout: 90_000,
  expect: { timeout: 15_000 },

  fullyParallel: true,
  workers: 3,
  forbidOnly: true,
  // Test, který projde až napodruhé, se ukáže jako „flaky" — neignorovat.
  retries: 1,

  reporter: [["list"], ["html", { outputFolder: "e2e/zprava", open: "never" }]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "cs-CZ",
    timezoneId: "Europe/Prague",
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "android", use: { ...devices["Pixel 7"] }, grep: NA_TELEFONU },
    { name: "iphone", use: { ...devices["iPhone 15"] }, grep: NA_TELEFONU },
  ],

  webServer: {
    command: "sh e2e/server.sh",
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: process.env.E2E_PRODUKCE === "1" ? 900_000 : 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
