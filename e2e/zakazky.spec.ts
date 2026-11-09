import { expect, test } from "@playwright/test";

import { bezVodorovnehoPosuvu, prihlas, sql, TELEFON, UCTY, zalozZakaznika } from "./pomocne";

// Krok 2A: zakázky. Oprávnění (Jakub, 8. 11. 2026): vidí, zakládají
// a upravují Majitel a Dispečer, maže jen Majitel. Technik vidí jen své
// přidělené (krok 2B); cizí detail i založení vrací 404.

test("technik vidí jen své zakázky a cizí ani založení neotevře", async ({ page }) => {
  await prihlas(page, UCTY.technik.email);
  const seznam = page.getByRole("list", { name: "Seznam zakázek" });
  // V ukázkových datech má přidělené zakázky 2, 4 a 5; zakázka 1 je nová.
  await expect(seznam.getByText("Nefunkční zvonek a domácí telefon u bytu č. 12.")).toBeVisible();
  await expect(seznam.getByText("Pravidelný servis pece")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nová zakázka" })).toHaveCount(0);
  for (const adresa of ["/zakazky/nova", "/zakazky/seed-zakazka-1"]) {
    expect((await page.goto(adresa))?.status(), adresa).toBe(404);
  }
});

test("nepřihlášený jde na přihlášení", async ({ page }) => {
  await page.goto("/zakazky/seed-zakazka-1");
  await expect(page).toHaveURL(/\/prihlaseni/);
});

test("dispečer založí zakázku z karty zákazníka, najde ji a upraví", async ({ page }) => {
  await prihlas(page, UCTY.dispecer.email);
  const { nazev } = await zalozZakaznika(page);

  // Z karty: zákazník předvybraný, místo předvyplněné jeho adresou.
  await page.getByRole("link", { name: "Nová zakázka" }).click();
  await expect(page.getByLabel("Zákazník")).toHaveValue(/.+/);
  await expect(page.getByLabel("Místo výjezdu")).toHaveValue("Dlouhá 5, Žďár nad Sázavou");
  await page.getByLabel("Co je potřeba udělat").fill("Výměna oběhového čerpadla v kotelně.");
  await page.getByLabel("Termín (nepovinné)").fill("2026-12-03");
  await page.getByRole("button", { name: "Založit zakázku" }).click();

  const nadpis = page.getByRole("heading", { level: 1, name: /^Zakázka č\. \d+$/ });
  await expect(nadpis).toBeVisible();
  const cislo = (await nadpis.textContent())!.replace(/\D/g, "");
  await expect(page.getByText("3. 12. 2026")).toBeVisible();
  await expect(page.getByText("Založeno").first()).toBeVisible();
  await expect(page.getByRole("link", { name: nazev })).toBeVisible();

  // Hledání podle čísla i podle zákazníka bez diakritiky.
  for (const vyraz of [cislo, `${nazev.split(" ").pop()} reznicek`]) {
    await page.goto("/");
    await page.getByLabel(/Hledat podle čísla/).fill(vyraz);
    await page.getByRole("button", { name: "Hledat" }).click();
    await expect(
      page.getByRole("list", { name: "Seznam zakázek" }).getByRole("link", {
        name: `Zakázka č. ${cislo}`,
      }),
    ).toBeVisible();
  }

  await page.getByRole("link", { name: `Zakázka č. ${cislo}` }).click();
  await page.getByText("Upravit zakázku").click();
  await page.getByLabel("Co je potřeba udělat").fill("Výměna čerpadla a odvzdušnění topení.");
  await page.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Uloženo." })).toBeVisible();
  await expect(page.getByText("Upraveno: Popis")).toBeVisible();
  await expect(page.getByText("Výměna čerpadla a odvzdušnění topení.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Smazat zakázku" })).toHaveCount(0);
});

test("majitel smaže zakázku po potvrzení", async ({ page }) => {
  await prihlas(page);
  await zalozZakaznika(page);
  await page.getByRole("link", { name: "Nová zakázka" }).click();
  await page.getByLabel("Co je potřeba udělat").fill("Zakázka ke smazání.");
  await page.getByRole("button", { name: "Založit zakázku" }).click();
  const nadpis = page.getByRole("heading", { level: 1, name: /^Zakázka č\. \d+$/ });
  const textNadpisu = (await nadpis.textContent())!;
  const cislo = textNadpisu.replace(/\D/g, "");
  const adresa = page.url();

  await page.getByRole("button", { name: "Smazat zakázku" }).click();
  const okno = page.getByRole("dialog", { name: `Smazat zakázku č. ${cislo}?` });
  await expect(okno.getByText("Tuto akci nelze vzít zpět.")).toBeVisible();
  await okno.getByRole("button", { name: "Ano, smazat zakázku" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: textNadpisu })).toHaveCount(0);
  expect((await page.goto(adresa))?.status()).toBe(404);

  // V databázi zůstala jen označená; historie má záznam o smazání.
  const id = adresa.split("/").pop();
  const radky = await sql('SELECT "deletedAt" FROM zakazky WHERE id = $1', [id]);
  expect(radky[0].deletedAt).not.toBeNull();
  const historie = await sql(
    'SELECT action FROM historie WHERE "entityId" = $1 ORDER BY "createdAt"',
    [id],
  );
  expect(historie.map((h) => h.action)).toEqual(["zalozeno", "smazano"]);
});

test("zakázky se vejdou na telefon", TELEFON, async ({ page }) => {
  await prihlas(page, UCTY.dispecer.email);
  await expect(page.getByRole("list", { name: "Seznam zakázek" })).toBeVisible();
  await bezVodorovnehoPosuvu(page);
  await page.goto("/zakazky/seed-zakazka-2");
  await page.getByText("Upravit zakázku").click();
  await bezVodorovnehoPosuvu(page);
  await page.goto("/zakazky/nova");
  await bezVodorovnehoPosuvu(page);
});

test("technik na telefonu: seznam a detail bez posuvu", TELEFON, async ({ page }) => {
  await prihlas(page, UCTY.technik.email);
  await expect(page.getByRole("list", { name: "Seznam zakázek" })).toBeVisible();
  await bezVodorovnehoPosuvu(page);
  await page.goto("/zakazky/seed-zakazka-2");
  await expect(page.getByRole("heading", { name: "Stav" })).toBeVisible();
  await bezVodorovnehoPosuvu(page);
});
