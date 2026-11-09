import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Krok 5A: ukázkový režim. Rozhodnutí Jakuba (9. 11. 2026): tlačítka
// „Vyzkoušet jako …“ se známým heslem, obnova dat při prvním otevření
// nového dne, chráněné jen tři ukázkové účty, data kolem dnešního týdne.

const TELEFON = { tag: "@telefon" } as const;

/** Přímý dotaz jen do databáze testů ukázky. */
async function sql(dotaz: string, parametry: unknown[] = []) {
  const adresa = process.env.DATABASE_URL;
  if (!adresa?.endsWith("/portal_test_ukazka"))
    throw new Error("sql() jen nad portal_test_ukazka.");
  const { Client } = await import("pg");
  const klient = new Client({ connectionString: adresa });
  await klient.connect();
  try {
    return (await klient.query(dotaz, parametry)).rows;
  } finally {
    await klient.end();
  }
}

/** Náhodná adresa — přihlášení má limit 5 pokusů z jedné adresy. */
async function novaAdresa(page: Page) {
  const n = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-real-ip": `10.${n()}.${n()}.${n()}` });
}

async function vyzkousetJako(page: Page, role: "Majitel" | "Dispečer" | "Technik") {
  await novaAdresa(page);
  await page.goto("/prihlaseni");
  await page.getByRole("button", { name: `Vyzkoušet jako ${role}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zakázky" })).toBeVisible();
}

function seznam(page: Page) {
  return page.getByRole("list", { name: "Seznam zakázek" }).getByRole("listitem");
}

test("přihlášení jedním klikem, pruh ukázky a data kolem dnešního týdne", async ({ page }) => {
  await novaAdresa(page);
  await page.goto("/prihlaseni");
  await expect(page.getByRole("complementary", { name: "Ukázka" })).toContainText(
    "Ukázka s vymyšlenými daty",
  );
  await expect(page.getByText("ukazka-jkservis")).toBeVisible();

  await page.getByRole("button", { name: "Vyzkoušet jako Dispečer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zakázky" })).toBeVisible();
  await expect(page.getByText("Petr Dvořák · Dispečer")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Ukázka" })).toBeVisible();
  await expect(seznam(page)).toHaveCount(15);

  await page.goto("/prehled");
  const tyden = page.getByRole("region", { name: /^Týden / });
  await expect(
    tyden.getByRole("listitem").filter({ hasText: "dnes" }).getByRole("link"),
  ).toHaveCount(2);
  await expect(page.getByRole("region", { name: "Po termínu" }).getByRole("link")).toHaveCount(2);
});

test("technik vidí jen své zakázky", async ({ page }) => {
  await vyzkousetJako(page, "Technik");
  await expect(page.getByText("Tomáš Beneš · Technik")).toBeVisible();
  // Technikovi Benešovi patří 5 z 15 ukázkových zakázek.
  await expect(seznam(page)).toHaveCount(5);
});

test("ukázkové účty nejde změnit ani zrušit, další uživatele ano", async ({ page }) => {
  await vyzkousetJako(page, "Majitel");
  await page.goto("/uzivatele");
  const dispecer = page.getByRole("listitem").filter({ hasText: "dispecer@jkservis.example" });

  await dispecer.getByRole("button", { name: "Zrušit účet" }).click();
  const okno = page.getByRole("dialog");
  await okno.getByRole("button", { name: /^Ano/ }).click();
  await expect(okno.getByRole("alert")).toHaveText(
    "Ukázkový účet měnit nejde — ostatní návštěvníci by se pak nepřihlásili.",
  );
  await okno.getByRole("button", { name: "Ponechat účet" }).click();

  // Odkaz na nové heslo pro ukázkový účet taky ne.
  await dispecer.getByRole("button", { name: "Nový odkaz k heslu" }).click();
  await expect(
    dispecer
      .getByText("Ukázkový účet měnit nejde — ostatní návštěvníci by se pak nepřihlásili.")
      .filter({ visible: true }),
  ).toBeVisible();

  // Nový účet si návštěvník založit smí (v noci zmizí).
  await page.getByLabel("Jméno a příjmení").fill("Karel Zkušební");
  await page.getByLabel("E-mail").fill(`karel.${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Založit účet" }).click();
  await expect(page.getByLabel("Odkaz k nastavení hesla pro: Karel Zkušební")).toBeVisible();
});

test("první otevření nového dne vrátí data do výchozího stavu", async ({ page }) => {
  await vyzkousetJako(page, "Majitel");
  await sql(`UPDATE zakazky SET "deletedAt" = now() WHERE id = 'ukazka-zakazka-15'`);
  await sql(
    `INSERT INTO users (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
     VALUES ('navstevnik', 'Návštěvník Ukázky', 'navstevnik@example.com', true, 'TECHNIK', now(), now())`,
  );
  await page.reload();
  await expect(seznam(page)).toHaveCount(14);

  // „Včera“ obnovená ukázka → první požadavek dnes ji obnoví.
  await sql(`UPDATE nastaveni SET "demoRestoredDay" = '2000-01-01' WHERE id = 'firma'`);
  await page.reload();
  await expect(seznam(page)).toHaveCount(15);
  expect(await sql(`SELECT id FROM users WHERE email = 'navstevnik@example.com'`)).toHaveLength(0);
  // Přihlášení ukázkového účtu obnovu přežilo a čísla zakázek začínají od 1.
  await expect(page.getByText("Jana Králová · Majitel")).toBeVisible();
  expect(await sql(`SELECT min(number) AS n FROM zakazky`)).toEqual([{ n: 1 }]);
});

test(
  "přihlašovací stránka ukázky na telefonu nepřečnívá a projde axe",
  TELEFON,
  async ({ page }) => {
    await page.goto("/prihlaseni");
    await expect(page.getByRole("button", { name: "Vyzkoušet jako Technik" })).toBeVisible();
    const preciva = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(preciva).toBeLessThanOrEqual(1);
    for (const vzhled of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: vzhled });
      const vysledek = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      expect(vysledek.violations).toEqual([]);
    }
  },
);
