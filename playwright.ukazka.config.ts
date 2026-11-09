import { defineConfig, devices } from "@playwright/test";

/**
 * Testy ukázkového režimu (krok 5A) — samostatně, protože `UKAZKA=1`
 * mění přihlašovací stránku a obnova maže data, na kterých stojí hlavní
 * sada. Vlastní databáze `portal_test_ukazka` a server na portu 3300.
 *
 *   docker compose --profile test run --rm e2e npx playwright test -c playwright.ukazka.config.ts
 *
 * Běží po jednom (obnova mění data pro všechny).
 */
const adresa = process.env.DATABASE_URL ?? "";
if (!adresa.endsWith("/portal_test") && !adresa.endsWith("/portal_test_ukazka")) {
  throw new Error("Testy ukázky smí běžet jen v kontejneru e2e (docker compose --profile test).");
}
process.env.DATABASE_URL = adresa.replace(/\/portal_test$/, "/portal_test_ukazka");
process.env.UKAZKA = "1";
process.env.PORT_APLIKACE = "3300";

export default defineConfig({
  testDir: "./e2e-ukazka",
  outputDir: "./e2e-ukazka/vysledky",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e-ukazka/zprava", open: "never" }]],
  use: {
    baseURL: "http://localhost:3300",
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
    { name: "android", use: { ...devices["Pixel 7"] }, grep: /@telefon/ },
  ],
  webServer: {
    command: "sh e2e/server.sh",
    url: "http://localhost:3300/prihlaseni",
    reuseExistingServer: false,
    timeout: process.env.E2E_PRODUKCE === "1" ? 900_000 : 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
