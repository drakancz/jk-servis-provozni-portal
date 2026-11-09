import { devices, expect, test, type Browser, type Page } from "@playwright/test";

import { sesit } from "../../e2e/excel";

const DESKTOP = { viewport: { width: 1440, height: 900 } };
const TELEFON = { ...devices["Pixel 7"], viewport: { width: 412, height: 839 } };
const OUT = "docs/snimky";

async function stranka(browser: Browser, volby: object): Promise<Page> {
  const ctx = await browser.newContext({
    ...volby,
    colorScheme: "dark",
    locale: "cs-CZ",
    timezoneId: "Europe/Prague",
    baseURL: "http://localhost:3300",
  });
  const page = await ctx.newPage();
  const n = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-real-ip": `10.${n()}.${n()}.${n()}` });
  return page;
}

async function jako(page: Page, role: string) {
  await page.goto("/prihlaseni");
  await page.getByRole("button", { name: `Vyzkoušet jako ${role}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zakázky" })).toBeVisible();
}

async function snimek(page: Page, nazev: string, cela = false) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${nazev}.png`, fullPage: cela });
}

test("snímky do README", async ({ browser }) => {
  test.setTimeout(240_000);

  const vstup = await stranka(browser, DESKTOP);
  await vstup.goto("/prihlaseni");
  await snimek(vstup, "prihlaseni");

  const dispecer = await stranka(browser, DESKTOP);
  await jako(dispecer, "Dispečer");
  await snimek(dispecer, "zakazky");
  await dispecer.goto("/import");
  await dispecer.getByLabel("Tabulka Excelu").setInputFiles({
    name: "zakazky.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: sesit({
      Zakázky: [
        ["Firma", "Tel.", "Adresa", "Závada", "Datum"],
        ["Pekárna U Mlýna", "", "Mlýnská 4, Turnov", "Nejde pec", "2026-11-20"],
        ["Byt Šimková", "603 000 555", "Nová 8, Jablonec", "Výměna termostatu", ""],
        ["Autoservis Brož", "", "Polní 12, Liberec", "Netopí v dílně", "zítra"],
      ],
    }),
  });
  await dispecer.getByRole("button", { name: "Načíst tabulku" }).click();
  await expect(dispecer.getByRole("region", { name: "Náhled tabulky" })).toBeVisible();
  await dispecer
    .getByRole("heading", { name: "2. Přiřazení sloupců" })
    .evaluate((h) => window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 24));
  await snimek(dispecer, "import");

  const majitel = await stranka(browser, DESKTOP);
  await jako(majitel, "Majitel");
  await majitel.goto("/prehled");
  await snimek(majitel, "prehled");
  await majitel.goto("/zakazky/ukazka-zakazka-3");
  await snimek(majitel, "zakazka-vykaz", true);

  const technik = await stranka(browser, TELEFON);
  await jako(technik, "Technik");
  await snimek(technik, "technik-telefon");
  await technik.getByRole("list", { name: "Seznam zakázek" }).getByRole("link").first().click();
  await expect(technik.getByRole("heading", { name: "Stav" })).toBeVisible();
  await snimek(technik, "technik-zakazka-telefon", true);
});
