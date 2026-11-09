import { expect, test, type Page } from "@playwright/test";

import {
  bezVodorovnehoPosuvu,
  chybaFormulare,
  heslo,
  nahodnaAdresa,
  prihlas,
  TELEFON,
  UCTY,
  vyplnPrihlaseni,
} from "./pomocne";

// Krok 1B: přihlášení. Nepřihlášený vidí jen přihlášení; úvodní stránku
// vidí všechny tři role (Jakub, 7. 11. 2026).

test.describe("nepřihlášený", () => {
  test("je poslán na přihlášení", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/prihlaseni$/);
    await expect(page.getByRole("heading", { level: 1, name: "Provozní portál" })).toBeVisible();
  });

  test("s neplatnou cookie se k obsahu nedostane", async ({ page, context }) => {
    // Proxy cookie pustí dál — rozhodnout musí až server.
    await context.addCookies([
      { name: "better-auth.session_token", value: "neplatny.token", url: "http://localhost:3100" },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/prihlaseni/);
    await expect(page.getByRole("heading", { name: "Zakázky" })).toHaveCount(0);
  });

  test("veřejná registrace neexistuje", async ({ request }) => {
    const odpoved = await request.post("/api/auth/sign-up/email", {
      headers: { "x-real-ip": nahodnaAdresa(), origin: "http://localhost:3100" },
      data: { email: "cizi@example.com", password: "dlouhe-heslo-123456", name: "Cizí" },
    });
    expect(odpoved.ok()).toBe(false);
  });

  test("přihlašovací stránka se vejde na telefon", TELEFON, async ({ page }) => {
    await page.goto("/prihlaseni");
    await expect(page).toHaveTitle("Přihlášení · Provozní portál");
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await bezVodorovnehoPosuvu(page);
  });
});

for (const ucet of Object.values(UCTY)) {
  test(`${ucet.role} se přihlásí, vidí úvodní stránku a odhlásí se`, TELEFON, async ({ page }) => {
    await prihlas(page, ucet.email);
    await expect(page.getByText(`${ucet.jmeno} · ${ucet.role}`)).toBeVisible();
    await bezVodorovnehoPosuvu(page);

    await page.getByRole("button", { name: "Odhlásit" }).click();
    await expect(page).toHaveURL(/\/prihlaseni$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/prihlaseni$/);
  });
}

test("po přihlášení se vrátí na adresu, ze které přišel", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": nahodnaAdresa() });
  await page.goto("/?zkouska=1");
  await expect(page).toHaveURL(/\/prihlaseni\?zpet=/);
  await vyplnPrihlaseni(page, UCTY.dispecer.email, heslo());
  await expect(page).toHaveURL(/\/\?zkouska=1$/);
});

test("odkaz zpět na cizí web se nepoužije", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": nahodnaAdresa() });
  await page.goto("/prihlaseni?zpet=//example.com");
  await vyplnPrihlaseni(page, UCTY.technik.email, heslo());
  await expect(page.getByRole("heading", { level: 1, name: "Zakázky" })).toBeVisible();
  expect(new URL(page.url()).host).toBe("localhost:3100");
});

test("přihlášený na /prihlaseni jde rovnou do portálu", async ({ page }) => {
  await prihlas(page);
  await page.goto("/prihlaseni");
  await expect(page.getByRole("heading", { level: 1, name: "Zakázky" })).toBeVisible();
});

test("špatné heslo ukáže chybu, neprozradí, jestli účet existuje", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": nahodnaAdresa() });
  await page.goto("/prihlaseni");
  await vyplnPrihlaseni(page, UCTY.majitel.email, "spatne-heslo-123");
  await expect(chybaFormulare(page)).toHaveText("Nesprávný e-mail nebo heslo.");

  await vyplnPrihlaseni(page, "nikdo@jkservis.example", "spatne-heslo-123");
  await expect(chybaFormulare(page)).toHaveText("Nesprávný e-mail nebo heslo.");
});

test("po 5 pokusech z jedné adresy se přihlášení na čas zablokuje", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-real-ip": nahodnaAdresa() });
  await page.goto("/prihlaseni");
  for (let i = 0; i < 5; i++) {
    await vyplnPrihlaseni(page, UCTY.majitel.email, `spatne-heslo-${i}-xx`);
    await expect(chybaFormulare(page)).toHaveText("Nesprávný e-mail nebo heslo.");
    await expect(page.getByRole("button", { name: "Přihlásit se" })).toBeEnabled();
  }
  // Ani správné heslo teď neprojde.
  await vyplnPrihlaseni(page, UCTY.majitel.email, heslo());
  await expect(chybaFormulare(page)).toHaveText(/Příliš mnoho pokusů/);
});

test("odpověď nese bezpečnostní hlavičky a Content-Security-Policy", async ({ request }) => {
  const odpoved = await request.get("/prihlaseni");
  const hlavicky = odpoved.headers();
  expect(hlavicky["x-frame-options"]).toBe("DENY");
  expect(hlavicky["x-content-type-options"]).toBe("nosniff");
  expect(hlavicky["x-powered-by"]).toBeUndefined();
  expect(hlavicky["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+'/);
});

/*
 * Zablokování se pozná podle události `securitypolicyviolation` (jako
 * v CRM, e2e/zabezpeceni.spec.ts). Sbírá se od začátku načtení.
 */
type Okno = Window & { __zablokovano?: string[]; __spusteno?: boolean };

async function hlidejZablokovani(page: Page) {
  await page.addInitScript(() => {
    const w = window as Okno;
    w.__zablokovano = [];
    document.addEventListener("securitypolicyviolation", (u) => {
      w.__zablokovano!.push(`${u.effectiveDirective} ${u.blockedURI}`);
    });
  });
}
const zablokovano = (page: Page) => page.evaluate(() => (window as Okno).__zablokovano ?? []);

test("vložený cizí skript se nespustí", async ({ page }) => {
  await hlidejZablokovani(page);
  await page.goto("/prihlaseni");
  await expect(page.getByLabel("E-mail")).toBeVisible();

  // Tak by vypadal útok přes text (třeba z Excelu) vložený jako HTML.
  await page.evaluate(() => {
    const misto = document.createElement("div");
    misto.innerHTML = '<img src="/neexistuje.png" onerror="window.__spusteno = true">';
    document.body.append(misto);
  });

  await expect.poll(() => zablokovano(page)).toContainEqual(expect.stringMatching(/^script-src/));
  expect(await page.evaluate(() => (window as Okno).__spusteno)).toBeUndefined();
});

test("na vlastních stránkách prohlížeč nic nezablokuje", async ({ page }) => {
  await hlidejZablokovani(page);
  await prihlas(page);
  expect(await zablokovano(page)).toEqual([]);
});

test("neexistující adresa vrátí přihlášenému 404", async ({ page }) => {
  await prihlas(page);
  const odpoved = await page.goto("/tohle-neexistuje");
  expect(odpoved?.status()).toBe(404);
});
