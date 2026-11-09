import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  bezVodorovnehoPosuvu,
  chybaFormulare,
  nahodnaAdresa,
  prihlas,
  pripona,
  sql,
  TELEFON,
  UCTY,
  vyplnPrihlaseni,
} from "./pomocne";

// Krok 1C: správa uživatelů. Oprávnění (Jakub, 8. 11. 2026): vidí a mění
// jen Majitel, Dispečer a Technik dostanou 404. Heslo si každý nastaví sám
// z jednorázového odkazu (24 hodin, jednou), který Majitel předá.

const NOVE_HESLO = "dlouhe-heslo-pro-test-1";

function radek(page: Page, email: string) {
  return page.getByRole("listitem").filter({ hasText: email });
}

/** Majitel založí účet přes obrazovku; vrátí odkaz k nastavení hesla. */
async function zalozUcet(page: Page, role: "Majitel" | "Dispečer" | "Technik" = "Technik") {
  const p = pripona();
  const jmeno = `Test ${p} Novák`;
  const email = `test-${p}@jkservis.example`;
  await page.goto("/uzivatele");
  const formular = page.getByRole("region", { name: "Přidat uživatele" });
  await formular.getByLabel("Jméno a příjmení").fill(jmeno);
  await formular.getByLabel("E-mail").fill(email);
  await formular.getByLabel("Role").selectOption({ label: role });
  await formular.getByRole("button", { name: "Založit účet" }).click();
  const pole = formular.getByRole("textbox", { name: `Odkaz k nastavení hesla pro: ${jmeno}` });
  await expect(pole).toBeVisible();
  await expect(formular.getByText(/Platí jednou, do/)).toBeVisible();
  return { jmeno, email, odkaz: await pole.inputValue() };
}

/** V novém prohlížeči nastaví heslo z odkazu a přihlásí se. */
async function nastavAPrihlas(browser: Browser, odkaz: string, email: string) {
  const kontext = await browser.newContext();
  const page = await kontext.newPage();
  await page.setExtraHTTPHeaders({ "x-real-ip": nahodnaAdresa() });
  await page.goto(odkaz);
  await page.getByLabel("Nové heslo").fill(NOVE_HESLO);
  await page.getByLabel("Heslo znovu").fill(NOVE_HESLO);
  await page.getByRole("button", { name: "Nastavit heslo" }).click();
  await expect(page).toHaveURL(/\/prihlaseni\?heslo=nastaveno$/);
  await expect(page.getByRole("status").filter({ hasText: "Heslo je nastavené" })).toBeVisible();
  await vyplnPrihlaseni(page, email, NOVE_HESLO);
  await expect(page.getByRole("heading", { level: 1, name: "Zakázky" })).toBeVisible();
  return page;
}

test.describe("kdo správu uživatelů nevidí", () => {
  test("nepřihlášený jde na přihlášení", async ({ page }) => {
    await page.goto("/uzivatele");
    await expect(page).toHaveURL(/\/prihlaseni\?zpet=%2Fuzivatele$/);
  });

  for (const ucet of [UCTY.dispecer, UCTY.technik]) {
    test(`${ucet.role} nemá odkaz v menu a dostane 404`, async ({ page }) => {
      await prihlas(page, ucet.email);
      await expect(page.getByRole("link", { name: "Uživatelé" })).toHaveCount(0);
      const odpoved = await page.goto("/uzivatele");
      expect(odpoved?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Uživatelé" })).toHaveCount(0);
    });
  }
});

test("majitel založí účet, člověk si z odkazu nastaví heslo a přihlásí se", async ({
  page,
  browser,
}) => {
  await prihlas(page);
  await page.getByRole("link", { name: "Uživatelé" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Uživatelé" })).toBeVisible();

  const { jmeno, email, odkaz } = await zalozUcet(page, "Dispečer");
  expect(odkaz).toMatch(/^http:\/\/localhost:3100\/nastavit-heslo\?t=[A-Za-z0-9_-]{43}$/);
  await expect(radek(page, email)).toContainText("Čeká na nastavení hesla");

  const novy = await nastavAPrihlas(browser, odkaz, email);
  await expect(novy.getByText(`${jmeno} · Dispečer`)).toBeVisible();

  // Odkaz platí jen jednou.
  await novy.goto(odkaz);
  await expect(novy.getByText("Odkaz už neplatí.")).toBeVisible();
  await novy.context().close();

  await page.reload();
  await expect(radek(page, email)).toContainText("Heslo nastavené");
});

test("nastavení hesla odmítne krátké a neshodné heslo", async ({ page }) => {
  await prihlas(page);
  const { odkaz } = await zalozUcet(page);
  await page.goto(odkaz);
  await page.getByLabel("Nové heslo").fill(NOVE_HESLO);
  await page.getByLabel("Heslo znovu").fill(`${NOVE_HESLO}x`);
  await page.getByRole("button", { name: "Nastavit heslo" }).click();
  await expect(chybaFormulare(page)).toHaveText("Hesla se neshodují.");
  // Odkaz po neúspěchu dál platí.
  await page.reload();
  await expect(page.getByLabel("Nové heslo")).toBeVisible();
});

test("neplatný, propadlý a nahrazený odkaz neplatí", async ({ page }) => {
  await page.goto("/nastavit-heslo?t=neplatny-odkaz");
  await expect(page.getByText("Odkaz už neplatí.")).toBeVisible();

  await prihlas(page);
  const prvni = await zalozUcet(page);
  // Nový odkaz zruší ten předchozí.
  await page.goto("/uzivatele");
  await radek(page, prvni.email).getByRole("button", { name: "Nový odkaz k heslu" }).click();
  const druhy = await radek(page, prvni.email)
    .getByRole("textbox", { name: /Odkaz k nastavení hesla/ })
    .inputValue();
  expect(druhy).not.toBe(prvni.odkaz);
  await page.goto(prvni.odkaz);
  await expect(page.getByText("Odkaz už neplatí.")).toBeVisible();

  // Propadlý odkaz (24 hodin) — čas se posune přímo v testovací databázi.
  await sql(
    `UPDATE odkazy_hesla SET "expiresAt" = now() - interval '1 minute'
     WHERE "userId" = (SELECT id FROM users WHERE email = $1)`,
    [prvni.email],
  );
  await page.goto(druhy);
  await expect(page.getByText("Odkaz už neplatí.")).toBeVisible();
});

test("stejný e-mail podruhé založit nejde", async ({ page }) => {
  await prihlas(page);
  const { email } = await zalozUcet(page);
  const formular = page.getByRole("region", { name: "Přidat uživatele" });
  await formular.getByLabel("Jméno a příjmení").fill("Někdo Jiný");
  await formular.getByLabel("E-mail").fill(email.toUpperCase());
  await formular.getByRole("button", { name: "Založit účet" }).click();
  await expect(chybaFormulare(page)).toContainText("už existuje");
});

test("majitel změní roli", async ({ page }) => {
  await prihlas(page);
  const { jmeno, email } = await zalozUcet(page, "Technik");
  await page.goto("/uzivatele");
  const r = radek(page, email);
  await r.getByLabel(`Role pro: ${jmeno}`).selectOption({ label: "Dispečer" });
  await r.getByRole("button", { name: "Uložit roli" }).click();
  await expect(r.getByRole("status")).toHaveText("Role změněna: Dispečer.");
  await page.reload();
  await expect(radek(page, email).getByLabel(`Role pro: ${jmeno}`)).toHaveValue("DISPECER");
});

test("zrušení účtu se potvrzuje, okamžitě odhlásí a přihlásit se už nejde", async ({
  page,
  browser,
}) => {
  await prihlas(page);
  const { jmeno, email, odkaz } = await zalozUcet(page);
  const zruseny = await nastavAPrihlas(browser, odkaz, email);

  await page.goto("/uzivatele");
  const r = radek(page, email);
  await r.getByRole("button", { name: "Zrušit účet" }).click();
  const okno = page.getByRole("dialog", { name: `Zrušit účet: ${jmeno}?` });
  await expect(okno).toBeVisible();
  await expect(okno).toContainText("Tuto akci nelze vzít zpět.");
  await expect(okno).toContainText("posledního majitele zrušit nejde");
  await okno.getByRole("button", { name: "Ponechat účet" }).click();
  await expect(okno).toBeHidden();

  await r.getByRole("button", { name: "Zrušit účet" }).click();
  await okno.getByRole("button", { name: "Ano, zrušit účet" }).click();
  await expect(okno).toBeHidden();
  const zrusene = page.getByRole("region", { name: /Zrušené účty/ });
  await expect(zrusene).toContainText(jmeno);
  await expect(page.getByRole("region", { name: /Aktivní účty/ })).not.toContainText(email);

  // Přihlášení na druhém zařízení okamžitě skončilo…
  await zruseny.goto("/");
  await expect(zruseny).toHaveURL(/\/prihlaseni/);
  // …a znovu se přihlásit nejde.
  await vyplnPrihlaseni(zruseny, email, NOVE_HESLO);
  await expect(chybaFormulare(zruseny)).toHaveText("Nesprávný e-mail nebo heslo.");
  await zruseny.context().close();
});

test("majitel nezmění vlastní roli ani nezruší vlastní účet", async ({ page }) => {
  await prihlas(page);
  await page.goto("/uzivatele");
  const ja = radek(page, UCTY.majitel.email);
  await expect(ja).toContainText("(vy)");
  await expect(ja).toContainText("Vlastní roli ani účet tady změnit nejde.");
  await expect(ja.getByRole("button", { name: "Zrušit účet" })).toHaveCount(0);
  await expect(ja.getByRole("combobox")).toHaveCount(0);
});

test("správa uživatelů se vejde na telefon", TELEFON, async ({ page }) => {
  await prihlas(page);
  await zalozUcet(page);
  await bezVodorovnehoPosuvu(page);
});

test("nastavení hesla se vejde na telefon", TELEFON, async ({ page, browser }) => {
  await prihlas(page);
  const { odkaz } = await zalozUcet(page);
  const kontext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const novy = await kontext.newPage();
  await novy.goto(odkaz);
  await expect(novy.getByLabel("Nové heslo")).toBeVisible();
  await bezVodorovnehoPosuvu(novy);
  await kontext.close();
});
