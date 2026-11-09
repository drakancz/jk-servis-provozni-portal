import { expect, test, type Browser, type Page } from "@playwright/test";

/** Štítek testu, který běží i na telefonech (playwright.config.ts). */
export const TELEFON = { tag: "@telefon" } as const;

/**
 * Stránka nesmí jít posouvat do strany. Patří jen do testu se štítkem
 * @telefon — bez něj by na telefonech vůbec neběžel, proto bez štítku
 * schválně spadne.
 */
export async function bezVodorovnehoPosuvu(page: Page) {
  if (!test.info().tags.includes(TELEFON.tag)) {
    throw new Error(`Test kontroluje rozložení, ale nemá štítek ${TELEFON.tag}.`);
  }
  const preciva = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(preciva, "stránka nesmí jít posouvat do strany").toBeLessThanOrEqual(1);
}

/** Ukázkové účty z `prisma/seed.ts`; heslo vymýšlí playwright.config.ts. */
export const UCTY = {
  majitel: { email: "majitel@jkservis.example", jmeno: "Jana Králová", role: "Majitel" },
  dispecer: { email: "dispecer@jkservis.example", jmeno: "Petr Dvořák", role: "Dispečer" },
  technik: { email: "technik@jkservis.example", jmeno: "Tomáš Beneš", role: "Technik" },
} as const;

export function heslo(): string {
  const h = process.env.SEED_HESLO;
  if (!h) throw new Error("Chybí SEED_HESLO (nastavuje playwright.config.ts).");
  return h;
}

/**
 * Náhodná adresa „odkud přicházím“. Přihlášení má limit 5 pokusů z jedné
 * adresy — testy běží souběžně, bez tohohle by se navzájem zablokovaly.
 * Funguje jen proto, že před testovací aplikací není proxy.
 */
export function nahodnaAdresa(): string {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return `10.${n()}.${n()}.${n()}`;
}

/** Vyplní přihlašovací formulář (stránka už musí být na /prihlaseni). */
export async function vyplnPrihlaseni(page: Page, email: string, hesloUctu: string) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(hesloUctu);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
}

/** Přihlásí účet z vlastní náhodné adresy a počká na úvodní stránku. */
export async function prihlas(page: Page, email: string = UCTY.majitel.email) {
  await page.setExtraHTTPHeaders({ "x-real-ip": nahodnaAdresa() });
  await page.goto("/prihlaseni");
  await vyplnPrihlaseni(page, email, heslo());
  await expect(page.getByRole("heading", { level: 1, name: "Zakázky" })).toBeVisible();
}

/**
 * Chybová hláška formuláře. `role="alert"` má i neviditelný hlasatel změn
 * stránky od Next.js (`__next-route-announcer__`) — proto jen neprázdná.
 */
export function chybaFormulare(page: Page) {
  // Hlasatel po přechodu na jinou stránku ohlásí její název — ten vynechat.
  return page.locator('[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: /\S/ });
}

/** Náhodná přípona názvů — testy běží souběžně a ve více prohlížečích. */
export function pripona(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Přímý dotaz do testovací databáze (jen tam, kam se přes obrazovku dostat
 * nedá — třeba propadlý odkaz). Jinou databázi odmítne.
 */
export async function sql(dotaz: string, parametry: unknown[] = []) {
  const adresa = process.env.DATABASE_URL;
  if (!adresa?.endsWith("/portal_test")) throw new Error("sql() jen nad databází portal_test.");
  const { Client } = await import("pg");
  const klient = new Client({ connectionString: adresa });
  await klient.connect();
  try {
    return (await klient.query(dotaz, parametry)).rows;
  } finally {
    await klient.end();
  }
}

/** Založí zákazníka přes obrazovku (krok 2A) a vrátí jeho název a adresu karty. */
export async function zalozZakaznika(page: Page, nazev = `Instalatérství Řezníček ${pripona()}`) {
  await page.goto("/zakaznici/novy");
  await page.getByLabel("Název firmy nebo jméno").fill(nazev);
  await page.getByLabel("Telefon (nepovinné)").fill("+420 777 123 456");
  await page.getByLabel("Adresa (nepovinné)").fill("Dlouhá 5, Žďár nad Sázavou");
  await page.getByRole("button", { name: "Založit zákazníka" }).click();
  await expect(page.getByRole("heading", { level: 1, name: nazev })).toBeVisible();
  return { nazev, adresa: page.url() };
}

/** Založí zákazníka a zakázku (kdo je přihlášený); vrátí adresu, číslo a zákazníka. */
export async function novaZakazka(page: Page) {
  const { nazev } = await zalozZakaznika(page);
  await page.getByRole("link", { name: "Nová zakázka" }).click();
  await page.getByLabel("Co je potřeba udělat").fill("Výměna termostatu v obývacím pokoji.");
  await page.getByRole("button", { name: "Založit zakázku" }).click();
  const nadpis = page.getByRole("heading", { level: 1, name: /^Zakázka č\. \d+$/ });
  await expect(nadpis).toBeVisible();
  const cislo = (await nadpis.textContent())!.replace(/\D/g, "");
  return { adresa: new URL(page.url()).pathname, cislo, zakaznik: nazev };
}

/** Přihlásí účet v novém, odděleném okně prohlížeče. */
export async function prihlasJinde(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await prihlas(page, email);
  return page;
}

/** Odznak stavu v oddílu Stav detailu zakázky. */
export function stavZakazky(page: Page) {
  return page.getByRole("region", { name: "Stav" }).locator("[data-stav]");
}

/** Zapíše do výkazu otevřené zakázky řádek práce (krok 2C). */
export async function zapisPraci(page: Page, hodiny: string, minuty: string, poznamka: string) {
  await page.getByRole("button", { name: "Zapsat práci" }).click();
  const formular = page.getByRole("form", { name: "Zapsat práci" });
  await formular.getByLabel("Hodin").fill(hodiny);
  await formular.getByLabel("Minut").fill(minuty);
  await formular.getByLabel("Co se dělalo").fill(poznamka);
  await formular.getByRole("button", { name: "Uložit práci" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Práce zapsána." })).toBeVisible();
}
