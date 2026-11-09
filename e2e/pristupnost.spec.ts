import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { bezVodorovnehoPosuvu, prihlas, TELEFON, UCTY } from "./pomocne";

/**
 * Přístupnost jako v CRM: axe na každé obrazovce ve světlém i tmavém
 * vzhledu (WCAG 2.2 AA). Nová obrazovka = nový řádek v OBRAZOVKY.
 *
 * Krok 5B: obrazovky i v pohledu Dispečera a Technika (jiné prvky — bez
 * peněz, bez úprav), stránka „nenalezeno“ a otevřená potvrzovací okna.
 */
type Ucet = keyof typeof UCTY | null;
const OBRAZOVKY: { adresa: string; ucet: Ucet }[] = [
  { adresa: "/prihlaseni", ucet: null },
  { adresa: "/", ucet: "majitel" },
  { adresa: "/uzivatele", ucet: "majitel" },
  { adresa: "/zakaznici", ucet: "majitel" },
  { adresa: "/zakaznici/novy", ucet: "majitel" },
  { adresa: "/zakaznici/seed-zakaznik-2", ucet: "majitel" },
  { adresa: "/zakazky/nova", ucet: "majitel" },
  { adresa: "/zakazky/seed-zakazka-2", ucet: "majitel" },
  { adresa: "/zakazky/seed-zakazka-4", ucet: "majitel" },
  { adresa: "/import", ucet: "majitel" },
  { adresa: "/cenik", ucet: "majitel" },
  { adresa: "/prehled", ucet: "majitel" },
  { adresa: "/prehled", ucet: "dispecer" },
  { adresa: "/cenik", ucet: "dispecer" },
  { adresa: "/zakazky/seed-zakazka-2", ucet: "dispecer" },
  { adresa: "/", ucet: "technik" },
  { adresa: "/zakazky/seed-zakazka-2", ucet: "technik" },
  { adresa: "/zakazky/neexistuje", ucet: "majitel" },
  { adresa: "/prihlaseni?heslo=nastaveno", ucet: null },
  { adresa: "/nastavit-heslo?t=neplatny", ucet: null },
];

async function zkontrolujAxe(page: Page) {
  const vysledek = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(vysledek.violations).toEqual([]);
}

const NAZEV_VZHLEDU = { light: "světlý", dark: "tmavý" } as const;

for (const vzhled of ["light", "dark"] as const) {
  for (const { adresa, ucet } of OBRAZOVKY) {
    const kdo = ucet ? `, ${UCTY[ucet].role}` : "";
    test(`${adresa} (${NAZEV_VZHLEDU[vzhled]} vzhled${kdo}) projde axe`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: vzhled });
      if (ucet) await prihlas(page, UCTY[ucet].email);
      await page.goto(adresa);
      await zkontrolujAxe(page);
    });
  }

  test(`otevřená potvrzovací okna (${NAZEV_VZHLEDU[vzhled]} vzhled) projdou axe`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: vzhled });
    await prihlas(page);

    await page.goto("/zakazky/seed-zakazka-3");
    await page.getByText("Upravit zakázku").click();
    await page.getByRole("button", { name: "Smazat zakázku" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await zkontrolujAxe(page);

    await page.goto("/uzivatele");
    await page
      .getByRole("listitem")
      .filter({ hasText: UCTY.dispecer.email })
      .getByRole("button", { name: "Zrušit účet" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await zkontrolujAxe(page);
  });
}

test("neexistující adresa i cizí sekce dostanou českou stránku nenalezeno", async ({ page }) => {
  await prihlas(page, UCTY.technik.email);
  for (const adresa of ["/zakazky/neexistuje", "/cenik", "/nesmysl"]) {
    const odpoved = await page.goto(adresa);
    expect(odpoved?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Stránka nenalezena" })).toBeVisible();
  }
  // Název v záložce má vlastní jen adresa bez stránky; u existující stránky
  // Next.js nechá její název (např. „Ceník“) — sekce je beztak v menu.
  await expect(page).toHaveTitle("Stránka nenalezena · Provozní portál");
});

test("z klávesnice jde přeskočit menu rovnou na obsah", async ({ page }) => {
  await prihlas(page);
  await page.keyboard.press("Tab");
  const odkaz = page.getByRole("link", { name: "Přeskočit na obsah" });
  await expect(odkaz).toBeFocused();
  await expect(odkaz).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

/** Každá obrazovka na telefonu bez posouvání do strany (i ty bez vlastního testu). */
const NA_TELEFONU: { ucet: keyof typeof UCTY; adresy: string[] }[] = [
  {
    ucet: "majitel",
    adresy: [
      "/",
      "/prehled",
      "/zakaznici",
      "/zakaznici/novy",
      "/zakaznici/seed-zakaznik-2",
      "/zakazky/nova",
      "/zakazky/seed-zakazka-2",
      "/cenik",
      "/import",
      "/uzivatele",
      "/zakazky/neexistuje",
    ],
  },
  { ucet: "technik", adresy: ["/", "/zakazky/seed-zakazka-2"] },
];

for (const { ucet, adresy } of NA_TELEFONU) {
  test(`obrazovky (${UCTY[ucet].role}) na telefonu nepřečnívají`, TELEFON, async ({ page }) => {
    await prihlas(page, UCTY[ucet].email);
    for (const adresa of adresy) {
      await page.goto(adresa);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await test.step(adresa, () => bezVodorovnehoPosuvu(page));
    }
  });
}
