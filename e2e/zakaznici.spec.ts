import { expect, test, type Browser } from "@playwright/test";

import {
  bezVodorovnehoPosuvu,
  chybaFormulare,
  prihlas,
  pripona,
  sql,
  TELEFON,
  UCTY,
  zalozZakaznika,
} from "./pomocne";

// Krok 2A: zákazníci. Oprávnění (Jakub, 8. 11. 2026): vidí, zakládají
// a upravují Majitel a Dispečer, maže jen Majitel (a jen bez zakázek),
// Technik nemá seznam ani kartu (404), nepřihlášený jde na přihlášení.

async function novyProhlizec(browser: Browser, email: string) {
  const kontext = await browser.newContext();
  const page = await kontext.newPage();
  await prihlas(page, email);
  return page;
}

test.describe("kdo zákazníky nevidí", () => {
  test("nepřihlášený jde na přihlášení", async ({ page }) => {
    await page.goto("/zakaznici");
    await expect(page).toHaveURL(/\/prihlaseni/);
  });

  test("technik nemá odkaz v menu a všude dostane 404", async ({ page }) => {
    await prihlas(page, UCTY.technik.email);
    await expect(page.getByRole("link", { name: "Zákazníci" })).toHaveCount(0);
    for (const adresa of ["/zakaznici", "/zakaznici/novy", "/zakaznici/seed-zakaznik-1"]) {
      const odpoved = await page.goto(adresa);
      expect(odpoved?.status(), adresa).toBe(404);
    }
  });
});

test("dispečer založí zákazníka, najde ho bez diakritiky a upraví", async ({ page }) => {
  await prihlas(page, UCTY.dispecer.email);
  await page.getByRole("link", { name: "Zákazníci" }).click();
  await page.getByRole("link", { name: "Nový zákazník" }).click();
  const p = pripona();
  const { nazev } = await zalozZakaznika(page, `Řeznictví Šťastný ${p}`);
  await expect(page.getByText("Založeno")).toBeVisible();

  // Hledání bez háčků a čárek, malými písmeny.
  await page.goto("/zakaznici");
  await page.getByLabel(/Hledat podle názvu/).fill(`reznictvi stastny ${p}`);
  await page.getByRole("button", { name: "Hledat" }).click();
  const seznam = page.getByRole("list", { name: "Seznam zákazníků" });
  await expect(seznam.getByRole("listitem")).toHaveCount(1);
  await seznam.getByRole("link", { name: nazev }).click();

  // Úprava jde do historie jen názvem pole, bez hodnot.
  await page.getByText("Upravit údaje").click();
  await page.getByLabel("Telefon (nepovinné)").fill("+420 777 999 000");
  await page.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Uloženo." })).toBeVisible();
  await expect(page.getByText("Upraveno: Telefon")).toBeVisible();
  await expect(page.getByText("+420 777 999 000").first()).toBeVisible();

  // Dispečer mazat nesmí — tlačítko nemá.
  await expect(page.getByRole("button", { name: "Smazat zákazníka" })).toHaveCount(0);
});

test("chybné IČO server odmítne", async ({ page }) => {
  await prihlas(page, UCTY.dispecer.email);
  await page.goto("/zakaznici/novy");
  await page.getByLabel("Název firmy nebo jméno").fill(`Firma ${pripona()}`);
  const ico = page.getByLabel("IČO (nepovinné)");
  await ico.fill("12a");
  // Kontrola prohlížeče se vypne, ať se ověří server.
  await ico.evaluate((pole: HTMLInputElement) => pole.removeAttribute("pattern"));
  await page.getByRole("button", { name: "Založit zákazníka" }).click();
  await expect(chybaFormulare(page)).toHaveText("IČO má 8 číslic.");
});

test("majitel smaže zákazníka bez zakázek po potvrzení", async ({ page }) => {
  await prihlas(page);
  const { nazev, adresa } = await zalozZakaznika(page);
  await page.getByRole("button", { name: "Smazat zákazníka" }).click();
  const okno = page.getByRole("dialog", { name: `Smazat zákazníka: ${nazev}?` });
  await expect(okno).toBeVisible();
  await expect(okno.getByText("Tuto akci nelze vzít zpět.")).toBeVisible();
  await expect(okno.getByText(/který má zakázky, smazat nejde/)).toBeVisible();

  // Zrušit nic nesmaže.
  await okno.getByRole("button", { name: "Zrušit" }).click();
  await expect(okno).toBeHidden();
  await page.getByRole("button", { name: "Smazat zákazníka" }).click();
  await okno.getByRole("button", { name: "Ano, smazat zákazníka" }).click();
  await expect(page).toHaveURL(/\/zakaznici$/);
  await expect(page.getByRole("link", { name: nazev })).toHaveCount(0);

  // Smazaný zákazník neexistuje ani přímou adresou; v databázi zůstal.
  expect((await page.goto(adresa))?.status()).toBe(404);
  const radky = await sql('SELECT "deletedAt" FROM zakaznici WHERE name = $1', [nazev]);
  expect(radky).toHaveLength(1);
  expect(radky[0].deletedAt).not.toBeNull();
});

test("zákazníka se zakázkami smazat nejde a okno zůstane otevřené", async ({ page }) => {
  await prihlas(page);
  await page.goto("/zakaznici/seed-zakaznik-2");
  await page.getByRole("button", { name: "Smazat zákazníka" }).click();
  const okno = page.getByRole("dialog");
  await okno.getByRole("button", { name: "Ano, smazat zákazníka" }).click();
  await expect(okno.getByRole("alert")).toHaveText(/má zakázky, proto smazat nejde/);
  await expect(okno).toBeVisible();
});

test("akce nejdou zavolat ani napřímo bez oprávnění", async ({ page, browser }) => {
  // Majitel zkusí smazat zákazníka se zakázkami (odmítne se) — zachytíme
  // skutečný požadavek akce a pošleme ho znovu jako dispečer a technik.
  await prihlas(page);
  await page.goto("/zakaznici/seed-zakaznik-2");
  await page.getByRole("button", { name: "Smazat zákazníka" }).click();
  const [pozadavek] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    page.getByRole("dialog").getByRole("button", { name: "Ano, smazat zákazníka" }).click(),
  ]);
  const hlavicky = {
    "next-action": pozadavek.headers()["next-action"],
    "content-type": pozadavek.headers()["content-type"] ?? "text/plain;charset=UTF-8",
    origin: new URL(pozadavek.url()).origin,
  };

  for (const ucet of [UCTY.dispecer, UCTY.technik]) {
    const cizi = await novyProhlizec(browser, ucet.email);
    const odpoved = await cizi.request.post("/zakaznici/seed-zakaznik-2", {
      headers: hlavicky,
      data: pozadavek.postData() ?? "",
    });
    expect(odpoved.status(), ucet.role).toBe(404);
    await cizi.context().close();
  }
});

test("zákazníci se vejdou na telefon", TELEFON, async ({ page }) => {
  await prihlas(page, UCTY.dispecer.email);
  await page.goto("/zakaznici");
  await expect(page.getByRole("heading", { level: 1, name: "Zákazníci" })).toBeVisible();
  await bezVodorovnehoPosuvu(page);
  await page.goto("/zakaznici/seed-zakaznik-2");
  await page.getByText("Upravit údaje").click();
  await bezVodorovnehoPosuvu(page);
});
