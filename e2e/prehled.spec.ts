import { expect, test, type Page } from "@playwright/test";

import {
  bezVodorovnehoPosuvu,
  prihlas,
  prihlasJinde,
  TELEFON,
  UCTY,
  zalozZakaznika,
} from "./pomocne";

// Krok 4B: přehled pro majitele. Oprávnění (Jakub, 9. 11. 2026):
// Majitel a Dispečer, částky jen Majitel, Technik 404, nepřihlášený na
// přihlášení.

/** Den v Praze posunutý o `dni` (`RRRR-MM-DD`). */
function denVPraze(dni = 0): string {
  const dnes = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  const d = new Date(`${dnes}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

/** Založí zakázku s termínem a vrátí její číslo. */
async function zakazkaSTerminem(page: Page, termin: string) {
  await zalozZakaznika(page);
  await page.getByRole("link", { name: "Nová zakázka" }).click();
  await page.getByLabel("Co je potřeba udělat").fill("Servisní prohlídka tepelného čerpadla.");
  await page.getByLabel("Termín (nepovinné)").fill(termin);
  await page.getByRole("button", { name: "Založit zakázku" }).click();
  const nadpis = page.getByRole("heading", { level: 1, name: /^Zakázka č\. \d+$/ });
  await expect(nadpis).toBeVisible();
  return (await nadpis.textContent())!.replace(/\D/g, "");
}

function tyden(page: Page) {
  return page.getByRole("region", { name: /^Týden / });
}

test("majitel vidí zakázky dneška v kalendáři týdne, po termínu i částky", async ({ page }) => {
  await prihlas(page, UCTY.majitel.email);
  const dnesni = await zakazkaSTerminem(page, denVPraze());
  const propadla = await zakazkaSTerminem(page, denVPraze(-3));

  await page
    .getByRole("navigation", { name: "Hlavní menu" })
    .getByRole("link", { name: "Přehled" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Přehled" })).toBeVisible();

  // Dlaždice: počty a u Majitele i částky.
  const zakazky = page.getByRole("region", { name: "Zakázky" });
  await expect(zakazky.getByRole("link", { name: /Otevřené/ })).toContainText(/\d+/);
  await expect(zakazky.getByRole("link", { name: /Hotové, nevyfakturované/ })).toContainText(
    "Kč bez DPH",
  );

  // Dnešní den v kalendáři má zakázku.
  const dnes = tyden(page).getByRole("listitem").filter({ hasText: "dnes" });
  await expect(dnes.getByRole("link", { name: `č. ${dnesni}` })).toBeVisible();

  // Po termínu.
  await expect(
    page.getByRole("region", { name: "Po termínu" }).getByRole("link", { name: `č. ${propadla}` }),
  ).toBeVisible();

  // Vytížení techniků.
  await expect(
    page.getByRole("list", { name: "Technici" }).getByText(UCTY.technik.jmeno),
  ).toBeVisible();

  // Další týden zakázku nemá, Tento týden vrátí zpět.
  await page.getByRole("link", { name: "Další týden →" }).click();
  await expect(page).toHaveURL(/tyden=\d{4}-\d{2}-\d{2}/);
  await expect(tyden(page).getByRole("link", { name: `č. ${dnesni}` })).toHaveCount(0);
  await page.getByRole("link", { name: "Tento týden" }).click();
  await expect(tyden(page).getByRole("link", { name: `č. ${dnesni}` })).toBeVisible();

  // Nesmyslný týden obrazovku neshodí.
  const odpoved = await page.goto("/prehled?tyden=2026-02-31");
  expect(odpoved?.status()).toBe(200);
  await expect(tyden(page).getByRole("link", { name: `č. ${dnesni}` })).toBeVisible();
});

test("dispečer přehled vidí bez částek, technik ho nevidí, nepřihlášený jde na přihlášení", async ({
  page,
  browser,
}) => {
  const dispecer = await prihlasJinde(browser, UCTY.dispecer.email);
  await dispecer.goto("/prehled");
  await expect(dispecer.getByRole("heading", { level: 1, name: "Přehled" })).toBeVisible();
  await expect(dispecer.getByRole("main")).not.toContainText("Kč");
  await dispecer.context().close();

  await prihlas(page, UCTY.technik.email);
  await expect(page.getByRole("link", { name: "Přehled" })).toHaveCount(0);
  expect((await page.request.get("/prehled")).status()).toBe(404);

  const host = await (await browser.newContext()).newPage();
  await host.goto("/prehled");
  await expect(host).toHaveURL(/\/prihlaseni/);
  await host.context().close();
});

test("přehled na telefonu nepřečnívá", TELEFON, async ({ page }) => {
  await prihlas(page, UCTY.majitel.email);
  await page.goto("/prehled");
  await expect(tyden(page)).toBeVisible();
  await bezVodorovnehoPosuvu(page);
});
