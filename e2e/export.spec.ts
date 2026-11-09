import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";

import {
  bezVodorovnehoPosuvu,
  novaZakazka,
  prihlas,
  prihlasJinde,
  TELEFON,
  UCTY,
  zapisPraci,
} from "./pomocne";

// Krok 3C: export zakázek do Excelu. Oprávnění (Jakub, 8. 11. 2026):
// Majitel a Dispečer, Technik 404, nepřihlášený 401. Podle filtru seznamu,
// sloupce jako import + číslo a výkaz.

const SLOUPCE = [
  "Číslo",
  "Zákazník",
  "Telefon",
  "E-mail",
  "Místo výjezdu",
  "Co je potřeba udělat",
  "Termín",
  "Stav",
  "Technik",
  "Hodiny práce",
  "Položek materiálu",
  "Cena bez DPH",
];

async function prectiSesit(obsah: Buffer) {
  const listy = await readXlsxFile(obsah);
  expect(listy.map((l) => l.sheet)).toEqual(["Zakázky"]);
  return listy[0].data;
}

test("majitel stáhne zakázky podle hledání i s výkazem a portál soubor zase načte", async ({
  page,
}) => {
  await prihlas(page, UCTY.majitel.email);
  const { cislo, zakaznik } = await novaZakazka(page);
  await zapisPraci(page, "1", "30", "Výměna termostatu");

  await page.goto(`/?q=${encodeURIComponent(zakaznik)}`);
  await expect(
    page.getByRole("list", { name: "Seznam zakázek" }).getByRole("listitem"),
  ).toHaveCount(1);
  const [stazeni] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Stáhnout do Excelu" }).click(),
  ]);
  expect(stazeni.suggestedFilename()).toMatch(/^zakazky-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const radky = await prectiSesit(await readFile(await stazeni.path()));
  expect(radky[0]).toEqual(SLOUPCE);
  expect(radky).toHaveLength(2);
  const [radek] = radky.slice(1);
  expect(radek[0]).toBe(Number(cislo));
  expect(radek[1]).toBe(zakaznik);
  expect(String(radek[2])).toContain("777");
  expect(radek[4]).toBe("Dlouhá 5, Žďár nad Sázavou");
  expect(radek[5]).toBe("Výměna termostatu v obývacím pokoji.");
  expect(radek[7]).toBe("Nová");
  // Hodiny jsou číslo (Excel s nimi umí počítat), ne text.
  expect(radek[9]).toBe(1.5);
  expect(radek[10]).toBe(0);
  // Cena bez DPH je číslo (1,5 h × hodinová sazba; sazbu mění testy ceníku).
  expect(typeof radek[11]).toBe("number");
  expect(radek[11] as number).toBeGreaterThan(0);

  // Soubor jde po úpravě nahrát zpět: import si sloupce přiřadí sám.
  await page.goto("/import");
  await page.getByLabel("Tabulka Excelu").setInputFiles(await stazeni.path());
  await page.getByRole("button", { name: "Načíst tabulku" }).click();
  await expect(page.getByRole("status")).toHaveText("Načteno 1 řádek z listu „Zakázky“.");
  for (const [index, pole] of SLOUPCE.slice(1, 9).entries()) {
    await expect(page.getByLabel(pole)).toHaveValue(String(index + 1));
  }
});

test("export drží filtr podle stavu a nesmyslný stav ignoruje", async ({ page }) => {
  await prihlas(page, UCTY.dispecer.email);

  const jenHotove = await page.request.get("/zakazky/export?stav=HOTOVA");
  expect(jenHotove.status()).toBe(200);
  const hotove = (await prectiSesit(await jenHotove.body())).slice(1);
  expect(hotove.length).toBeGreaterThan(0);
  expect(new Set(hotove.map((r) => r[7]))).toEqual(new Set(["Hotová"]));

  const nesmysl = await page.request.get("/zakazky/export?stav=cokoli");
  expect(nesmysl.status()).toBe(200);
  const vsechny = (await prectiSesit(await nesmysl.body())).slice(1);
  expect(vsechny.length).toBeGreaterThan(hotove.length);

  // Odkaz v seznamu nese aktuální filtr.
  await page.goto("/?stav=V_PRACI");
  await expect(page.getByRole("link", { name: "Stáhnout do Excelu" })).toHaveAttribute(
    "href",
    "/zakazky/export?stav=V_PRACI",
  );
});

test("technik export nevidí ani nestáhne, nepřihlášený dostane 401", async ({ page, browser }) => {
  await prihlas(page, UCTY.technik.email);
  await expect(page.getByRole("heading", { level: 1, name: "Zakázky" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stáhnout do Excelu" })).toHaveCount(0);
  expect((await page.request.get("/zakazky/export")).status()).toBe(404);

  const majitel = await prihlasJinde(browser, UCTY.majitel.email);
  expect((await majitel.request.get("/zakazky/export")).status()).toBe(200);
  await majitel.context().close();

  // Neplatná cookie projde přes proxy až k obsluze adresy → 401.
  const host = await browser.newContext();
  const bezPrihlaseni = await host.request.get("/zakazky/export", {
    headers: { cookie: "better-auth.session_token=neplatny" },
    maxRedirects: 0,
  });
  expect(bezPrihlaseni.status()).toBe(401);
  await host.close();
});

test("tlačítko exportu na telefonu nepřečnívá", TELEFON, async ({ page }) => {
  await prihlas(page, UCTY.dispecer.email);
  await expect(page.getByRole("link", { name: "Stáhnout do Excelu" })).toBeVisible();
  await bezVodorovnehoPosuvu(page);
});
