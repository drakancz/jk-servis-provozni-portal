import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  bezVodorovnehoPosuvu,
  chybaFormulare,
  novaZakazka,
  prihlas,
  prihlasJinde,
  pripona,
  sql,
  stavZakazky,
  TELEFON,
  UCTY,
  zapisPraci,
} from "./pomocne";

// Krok 4A: ceník. Oprávnění (Jakub, 9. 11. 2026):
// - ceník mění jen Majitel, Dispečer ho vidí jen ke čtení, Technik 404,
// - ceny u zakázky vidí Majitel a Dispečer, Technik vůbec,
// - jedna hodinová sazba, materiál z ceníku nebo ručně (cenu ručně jen
//   Majitel a Dispečer), ceny bez DPH, u zakázky i s DPH 21 %,
// - cena ve chvíli zápisu: změna ceníku zapsaný řádek nepřecení.
//
// Sazba je jedna pro celou firmu — testy, které ji mění, běží po sobě
// a na konci ji vrátí na 650 Kč.
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await sql(`UPDATE nastaveni SET "hourlyRate" = 650 WHERE id = 'firma'`);
});

function vykaz(page: Page) {
  return page.getByRole("region", { name: "Výkaz" });
}

function radek(page: Page, seznam: "Práce" | "Materiál", text: string) {
  return vykaz(page)
    .getByRole("list", { name: seznam })
    .getByRole("listitem")
    .filter({ hasText: text });
}

async function nastavSazbu(page: Page, sazba: string) {
  await page.goto("/cenik");
  await page.getByRole("button", { name: "Změnit sazbu" }).click();
  await page.getByLabel("Hodinová sazba (Kč bez DPH)").fill(sazba);
  await page.getByRole("button", { name: "Uložit sazbu" }).click();
  await expect(page.getByRole("status")).toHaveText("Hodinová sazba uložena.");
}

/** Zakázka přidělená technikovi, kterou technik rovnou začal. Vrací adresu. */
async function zakazkaTechnika(page: Page, browser: Browser) {
  const dispecer = await prihlasJinde(browser, UCTY.dispecer.email);
  const { adresa } = await novaZakazka(dispecer);
  await dispecer.getByLabel("Technik").selectOption({ label: UCTY.technik.jmeno });
  await dispecer.getByRole("button", { name: "Uložit přidělení" }).click();
  await expect(stavZakazky(dispecer)).toHaveText("Přidělená");
  await dispecer.context().close();
  await prihlas(page, UCTY.technik.email);
  await page.goto(adresa);
  await page.getByRole("button", { name: "Začít práci" }).click();
  await expect(stavZakazky(page)).toHaveText("V práci");
  return adresa;
}

test("změna sazby platí jen pro nově zapsanou práci a cena zakázky se sečte i s DPH", async ({
  page,
}) => {
  await prihlas(page, UCTY.majitel.email);
  await nastavSazbu(page, "650");
  const { adresa } = await novaZakazka(page);
  await zapisPraci(page, "1", "0", "Diagnostika kotle");
  await expect(radek(page, "Práce", "Diagnostika kotle")).toContainText("650,00 Kč");

  await nastavSazbu(page, "700");
  await expect(page.getByText("Hodinová sazba:")).toContainText("700,00 Kč");

  await page.goto(adresa);
  await zapisPraci(page, "1", "0", "Výměna čerpadla");
  await expect(radek(page, "Práce", "Výměna čerpadla")).toContainText("700,00 Kč");
  // Starý řádek si nechal sazbu ze dne zápisu.
  await expect(radek(page, "Práce", "Diagnostika kotle")).toContainText("650,00 Kč");

  // Materiál z ceníku: název, jednotka a cena z položky.
  await page.getByRole("button", { name: "Zapsat materiál" }).click();
  const formular = page.getByRole("form", { name: "Zapsat materiál" });
  await formular.getByLabel("Z ceníku").selectOption("seed-cenik-termostat");
  await expect(formular.getByLabel("Jednotka")).toHaveCount(0);
  await formular.getByLabel("Množství").fill("2");
  await formular.getByRole("button", { name: "Uložit materiál" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Materiál zapsán." })).toBeVisible();
  await expect(radek(page, "Materiál", "Termostat prostorový")).toContainText("2 ks");
  await expect(radek(page, "Materiál", "Termostat prostorový")).toContainText("2 580,00 Kč");

  // 650 + 700 + 2 580 = 3 930 bez DPH, DPH 21 % = 825,30.
  const cena = vykaz(page);
  await expect(cena.getByText("Celkem bez DPH")).toBeVisible();
  await expect(cena.locator("dd").nth(2)).toHaveText("3 930,00 Kč");
  await expect(cena.locator("dd").nth(3)).toHaveText("825,30 Kč");
  await expect(cena.locator("dd").nth(4)).toHaveText("4 755,30 Kč");

  // Ruční materiál bez ceny: zakázka upozorní, úprava cenu doplní.
  await page.getByRole("button", { name: "Zapsat materiál" }).click();
  const rucne = page.getByRole("form", { name: "Zapsat materiál" });
  await rucne.getByLabel("Materiál").fill("Odvzdušňovací ventil");
  await rucne.getByLabel("Množství").fill("1");
  await rucne.getByRole("button", { name: "Uložit materiál" }).click();
  await expect(radek(page, "Materiál", "Odvzdušňovací ventil")).toContainText("cena chybí");
  await expect(cena.getByText("U 1 položky materiálu chybí cena")).toBeVisible();

  await radek(page, "Materiál", "Odvzdušňovací ventil")
    .getByRole("button", { name: "Upravit" })
    .click();
  const uprava = page.getByRole("form", { name: "Upravit materiál" });
  await uprava.getByLabel("Cena za jednotku").fill("120,50");
  await uprava.getByRole("button", { name: "Uložit změny" }).click();
  await expect(radek(page, "Materiál", "Odvzdušňovací ventil")).toContainText("120,50 Kč");
  await expect(cena.getByText(/chybí cena/)).toHaveCount(0);

  await nastavSazbu(page, "650");
});

test("majitel přidá, upraví a smaže materiál v ceníku, dvojí název odmítne", async ({ page }) => {
  await prihlas(page, UCTY.majitel.email);
  await page
    .getByRole("navigation", { name: "Hlavní menu" })
    .getByRole("link", { name: "Ceník" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Ceník" })).toBeVisible();

  const nazev = `Pojistka ${pripona()}`;
  await page.getByRole("button", { name: "Přidat materiál" }).click();
  const formular = page.getByRole("form", { name: "Přidat materiál do ceníku" });
  await formular.getByLabel("Název materiálu").fill(nazev);
  await formular.getByLabel("Cena za jednotku").fill("12,50");
  await formular.getByLabel("Jednotka").selectOption("ks");
  await formular.getByRole("button", { name: "Přidat do ceníku" }).click();
  await expect(page.getByRole("status")).toHaveText("Materiál přidán do ceníku.");
  const polozka = page
    .getByRole("list", { name: "Ceník materiálu" })
    .getByRole("listitem")
    .filter({ hasText: nazev });
  await expect(polozka).toContainText("12,50 Kč / ks");

  // Stejný název (jinak napsaný) podruhé ne.
  await page.getByRole("button", { name: "Přidat materiál" }).click();
  const znovu = page.getByRole("form", { name: "Přidat materiál do ceníku" });
  await znovu.getByLabel("Název materiálu").fill(nazev.toUpperCase());
  await znovu.getByLabel("Cena za jednotku").fill("10");
  await znovu.getByRole("button", { name: "Přidat do ceníku" }).click();
  await expect(chybaFormulare(page)).toHaveText("Materiál s tímto názvem už v ceníku je.");
  await znovu.getByRole("button", { name: "Zrušit" }).click();

  // Nesmyslná cena.
  await polozka.getByRole("button", { name: "Upravit" }).click();
  const uprava = page.getByRole("form", { name: "Upravit položku ceníku" });
  await uprava.getByLabel("Cena za jednotku").fill("dvanáct");
  await uprava.getByRole("button", { name: "Uložit změny" }).click();
  await expect(chybaFormulare(page)).toHaveText(
    "Cenu zadejte číslem v Kč (nejvýš 2 desetinná místa).",
  );
  await uprava.getByLabel("Cena za jednotku").fill("15");
  await uprava.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByRole("status")).toHaveText("Položka ceníku upravena.");
  await expect(polozka).toContainText("15,00 Kč / ks");

  await polozka.getByRole("button", { name: "Smazat" }).click();
  const okno = page.getByRole("dialog", { name: `Smazat z ceníku: ${nazev}?` });
  await expect(okno).toContainText("Zakázky, kde už je zapsaný, si jeho cenu nechají.");
  await expect(okno).toContainText("Tuto akci nelze vzít zpět.");
  await okno.getByRole("button", { name: "Ano, smazat z ceníku" }).click();
  await expect(polozka).toHaveCount(0);
});

test("dispečer ceník jen vidí, technik ho ani ceny nevidí, ale materiál z ceníku zapíše", async ({
  page,
  browser,
}) => {
  const dispecer = await prihlasJinde(browser, UCTY.dispecer.email);
  await dispecer.goto("/cenik");
  await expect(dispecer.getByRole("heading", { level: 1, name: "Ceník" })).toBeVisible();
  await expect(dispecer.getByText("Ceník upravuje majitel.")).toBeVisible();
  await expect(dispecer.getByRole("button", { name: "Změnit sazbu" })).toHaveCount(0);
  await expect(dispecer.getByRole("button", { name: "Přidat materiál" })).toHaveCount(0);
  await expect(dispecer.getByRole("button", { name: "Upravit" })).toHaveCount(0);

  const adresa = await zakazkaTechnika(page, browser);
  await expect(page.getByRole("link", { name: "Ceník" })).toHaveCount(0);
  expect((await page.request.get("/cenik")).status()).toBe(404);

  // Technik vybere z ceníku, ale cenu nevidí ani ve výběru.
  await page.getByRole("button", { name: "Zapsat materiál" }).click();
  const formular = page.getByRole("form", { name: "Zapsat materiál" });
  const vyber = formular.getByLabel("Z ceníku");
  await expect(vyber.locator("option", { hasText: "Jistič B16 1f" })).toHaveText(
    "Jistič B16 1f (ks)",
  );
  await expect(formular.getByLabel("Cena za jednotku")).toHaveCount(0);
  await vyber.selectOption("seed-cenik-jistic");
  await formular.getByLabel("Množství").fill("3");
  await formular.getByRole("button", { name: "Uložit materiál" }).click();
  await expect(radek(page, "Materiál", "Jistič B16 1f")).toContainText("3 ks");
  await zapisPraci(page, "0", "30", "Výměna jističů");
  await expect(vykaz(page)).not.toContainText("Kč");
  await expect(vykaz(page).getByText("Cena zakázky")).toHaveCount(0);

  // Dispečer u téže zakázky cenu vidí: 3 × 189 = 567 Kč.
  await dispecer.goto(adresa);
  await expect(radek(dispecer, "Materiál", "Jistič B16 1f")).toContainText("567,00 Kč");
  await expect(vykaz(dispecer).getByText("Cena zakázky")).toBeVisible();
  await dispecer.context().close();
});

test("ceník a cena zakázky na telefonu nepřečnívají", TELEFON, async ({ page }) => {
  await prihlas(page, UCTY.majitel.email);
  await page.goto("/cenik");
  await expect(page.getByRole("list", { name: "Ceník materiálu" })).toBeVisible();
  await bezVodorovnehoPosuvu(page);
  await page.goto("/zakazky/seed-zakazka-4");
  await expect(vykaz(page).getByText("Cena zakázky")).toBeVisible();
  await bezVodorovnehoPosuvu(page);
});
