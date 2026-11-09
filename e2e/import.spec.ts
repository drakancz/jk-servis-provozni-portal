import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

import { sesit, zipBomba } from "./excel";
import {
  bezVodorovnehoPosuvu,
  chybaFormulare,
  pripona,
  prihlas,
  prihlasJinde,
  sql,
  TELEFON,
  UCTY,
  zalozZakaznika,
} from "./pomocne";

// Krok 3A: nahrání Excelu, přiřazení sloupců a náhled. Krok 3B: kontrola
// řádků, uložení jen bezchybných a vzorový soubor. Oprávnění (Jakub,
// 8. 11. 2026): Majitel a Dispečer, Technik 404, nepřihlášený na přihlášení.
// Soubor se nikam neukládá.

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ZAKAZKY = [
  ["Firma", "Tel.", "Adresa", "Závada", "Datum", "Poznámka interní"],
  [
    "Instalatérství Novák",
    "777 111 222",
    "Hlavní 1, Liberec",
    "Kape kohoutek",
    "2026-11-20",
    "spěchá",
  ],
  ["Pekárna U Mlýna", "", "Mlýnská 4, Turnov", "Nejde pec", "", ""],
  ["", "", "", "", "", ""],
  ["Byt Šimková", "603 444 555", "Nová 8, Jablonec", "Výměna termostatu", "", "klíč u sousedů"],
];

async function nahraj(page: Page, nazev: string, obsah: Buffer, mimeType = XLSX) {
  await page.getByLabel("Tabulka Excelu").setInputFiles({ name: nazev, mimeType, buffer: obsah });
  await page.getByRole("button", { name: "Načíst tabulku" }).click();
}

function nahled(page: Page) {
  return page.getByRole("region", { name: "Náhled tabulky" });
}

test(
  "dispečer nahraje tabulku, portál navrhne sloupce a ukáže náhled",
  TELEFON,
  async ({ page }) => {
    await prihlas(page, UCTY.dispecer.email);
    await page
      .getByRole("navigation", { name: "Hlavní menu" })
      .getByRole("link", { name: "Import" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Import z Excelu" })).toBeVisible();

    await nahraj(page, "zakazky.xlsx", sesit({ Zakázky: ZAKAZKY }));
    await expect(page.getByRole("status")).toHaveText("Načteno 3 řádky z listu „Zakázky“.");

    // Návrh podle názvů sloupců (i „Tel.“ a „Závada“ bez diakritiky).
    await expect(page.getByLabel("Zákazník")).toHaveValue("0");
    await expect(page.getByLabel("Telefon")).toHaveValue("1");
    await expect(page.getByLabel("Místo výjezdu")).toHaveValue("2");
    await expect(page.getByLabel("Co je potřeba udělat")).toHaveValue("3");
    await expect(page.getByLabel("Termín")).toHaveValue("4");
    await expect(page.getByLabel("E-mail")).toHaveValue("");
    await expect(page.getByLabel("Stav")).toHaveValue("");

    // Náhled: prázdný řádek 4 se vynechá, číslo řádku sedí s Excelem.
    const radky = nahled(page).getByRole("row");
    await expect(radky).toHaveCount(4);
    await expect(radky.nth(1)).toContainText("Instalatérství Novák");
    await expect(radky.nth(1)).toContainText("2026-11-20");
    await expect(radky.nth(3)).toContainText("Byt Šimková");
    await expect(radky.nth(3).getByRole("cell").first()).toHaveText("5");
    await bezVodorovnehoPosuvu(page);

    // Změna přiřazení se hned projeví; jeden sloupec patří jen jednomu údaji.
    await page.getByLabel("Technik").selectOption({ label: "F: Poznámka interní" });
    await expect(nahled(page).getByRole("columnheader", { name: "Technik" })).toBeVisible();
    await expect(radky.nth(3)).toContainText("klíč u sousedů");
    await page.getByLabel("Zákazník").selectOption({ label: "D: Závada" });
    await expect(page.getByLabel("Co je potřeba udělat")).toHaveValue("");
    await expect(page.getByText("Přiřaďte povinné údaje: Co je potřeba udělat.")).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await bezVodorovnehoPosuvu(page);
  },
);

test("u sešitu s více listy jde vybrat list", async ({ page }) => {
  await prihlas(page, UCTY.majitel.email);
  await page.goto("/import");
  await nahraj(
    page,
    "sesit.xlsx",
    sesit({ Poznámky: [["Text"], ["Jen poznámka"]], "Zakázky 2026": ZAKAZKY }),
  );
  await expect(page.getByRole("status")).toHaveText("Načteno 1 řádek z listu „Poznámky“.");
  await page.getByLabel("List sešitu").selectOption("Zakázky 2026");
  await expect(page.getByRole("status")).toHaveText("Načteno 3 řádky z listu „Zakázky 2026“.");
  await expect(nahled(page)).toContainText("Pekárna U Mlýna");
});

test("portál odmítne soubor, který není tabulka, zip bombu, prázdný a příliš velký", async ({
  page,
}) => {
  await prihlas(page, UCTY.dispecer.email);
  await page.goto("/import");
  const chyba = chybaFormulare(page);
  const NENI = "Soubor se nepodařilo přečíst. Nahrajte tabulku ve formátu .xlsx.";

  // Přípona .xlsx nestačí — rozhoduje obsah.
  await nahraj(page, "zakazky.xlsx", Buffer.from("Firma;Adresa\nNovák;Liberec\n"));
  await expect(chyba).toHaveText(NENI);
  await nahraj(page, "archiv.xlsx", Buffer.from(zipSync({ "readme.txt": strToU8("ahoj") })));
  await expect(chyba).toHaveText(NENI);

  await nahraj(page, "bomba.xlsx", zipBomba());
  await expect(chyba).toHaveText("Tabulka je po rozbalení příliš velká (víc než 50 MB).");

  await nahraj(page, "prazdna.xlsx", sesit({ List1: [["Firma", "Adresa"]] }));
  await expect(chyba).toHaveText("List „List1“ nemá pod řádkem s názvy sloupců žádná data.");

  const mnoho = [
    ["Firma", "Adresa"],
    ...Array.from({ length: 1001 }, (_, i) => [`Firma ${i}`, "Liberec"]),
  ];
  await nahraj(page, "velka.xlsx", sesit({ List1: mnoho }));
  await expect(chyba).toHaveText(
    "Tabulka má 1001 řádků, najednou jde nahrát nejvýš 1000. Rozdělte ji na menší části.",
  );

  await nahraj(page, "obri.xlsx", Buffer.alloc(2 * 1024 * 1024 + 1, 1));
  await expect(chyba).toHaveText("Soubor je větší než 2 MB.");
  await expect(nahled(page)).toHaveCount(0);
});

test("technik import nevidí a nepoužije ho ani napřímo, nepřihlášený jde na přihlášení", async ({
  page,
  browser,
}) => {
  // Dispečer nahraje soubor — zachytíme požadavek akce.
  await prihlas(page, UCTY.dispecer.email);
  await page.goto("/import");
  await page
    .getByLabel("Tabulka Excelu")
    .setInputFiles({ name: "z.xlsx", mimeType: XLSX, buffer: sesit({ Zakázky: ZAKAZKY }) });
  const [pozadavek] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    page.getByRole("button", { name: "Načíst tabulku" }).click(),
  ]);
  await expect(page.getByRole("status")).toContainText("Načteno 3 řádky");

  // Prohlížeč do zachyceného požadavku obsah souboru nedá — tělo se
  // poskládá znovu ve tvaru, jaký posílá React (argument FormData = "$K1",
  // jeho pole s předponou "_1_" a kořen "0" až na konci). Že je tvar správný, dokazuje Dispečer.
  // Pořadí drží FormData — v obyčejném objektu by klíč "0" šel vždy první.
  const primeVolani = (kdo: Page) => {
    const telo = new FormData();
    telo.append(
      "_1_soubor",
      new Blob([new Uint8Array(sesit({ Zakázky: ZAKAZKY }))], { type: XLSX }),
      "z.xlsx",
    );
    telo.append("0", '["$K1"]');
    return kdo.request.post("/import", {
      headers: {
        "next-action": pozadavek.headers()["next-action"],
        origin: new URL(pozadavek.url()).origin,
        accept: "text/x-component",
      },
      multipart: telo,
    });
  };
  const kontrola = await primeVolani(page);
  expect(kontrola.status()).toBe(200);
  expect(await kontrola.text()).toContain("Instalatérství Novák");

  const technik = await prihlasJinde(browser, UCTY.technik.email);
  await expect(
    technik.getByRole("navigation", { name: "Hlavní menu" }).getByRole("link", { name: "Import" }),
  ).toHaveCount(0);
  const stranka = await technik.goto("/import");
  expect(stranka?.status()).toBe(404);
  const odpoved = await primeVolani(technik);
  expect(odpoved.status()).toBe(404);
  expect(await odpoved.text()).not.toContain("Instalatérství Novák");
  await technik.context().close();

  const host = await (await browser.newContext()).newPage();
  await host.goto("/import");
  await expect(host).toHaveURL(/\/prihlaseni/);
  await host.context().close();
});

// ── Krok 3B: kontrola řádků a uložení ──────────────────────────────────

function souhrn(page: Page) {
  return page.getByRole("status").filter({ hasText: "Bez chyb:" });
}

function radekKontroly(page: Page, cislo: number) {
  return page
    .getByRole("region", { name: "Chyby a upozornění" })
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: String(cislo), exact: true }) });
}

/** Tabulka s chybami i upozorněními; zákazníci s příponou `p`. */
function tabulkaSChybami(p: string) {
  return [
    ["Firma", "Telefon", "Adresa", "Závada", "Termín", "Stav", "Technik"],
    // 2: existující zákazník (bez diakritiky, malými), technik obráceně → Přidělená
    [
      `instalaterstvi reznicek ${p}`,
      "",
      "Dlouhá 5, Žďár",
      "Kape kohoutek",
      "20. 11. 2026",
      "",
      "Beneš Tomáš",
    ],
    // 3: nový zákazník, neznámý technik → Nová (upozornění)
    [
      `Pekárna Nová ${p}`,
      "777 111 222",
      "Mlýnská 4, Turnov",
      "Nejde pec",
      "2026-11-25",
      "V práci",
      "Karel Neznámý",
    ],
    // 4: stejný nový zákazník podruhé → jeden zákazník, bez upozornění na telefon
    [`PEKARNA NOVA ${p}`, "abc", "Mlýnská 4, Turnov", "Druhá pec", "", "", ""],
    // 5: chybí zákazník
    ["", "", "Někde 1, Liberec", "Něco nefunguje", "", "", ""],
    // 6: nečitelný termín a Hotová
    [`Byt Šimková ${p}`, "", "Nová 8, Jablonec", "Termostat", "31. 2. 2026", "Hotová", ""],
    // 7: neznámý stav
    [`Byt Šimková ${p}`, "", "Nová 8, Jablonec", "Termostat", "", "vyřizuje se", ""],
  ];
}

test(
  "dispečer zkontroluje řádky a uloží jen bezchybné, zákazníka spáruje podle názvu",
  TELEFON,
  async ({ page }) => {
    const p = pripona();
    await prihlas(page, UCTY.dispecer.email);
    const existujici = await zalozZakaznika(page, `Instalatérství Řezníček ${p}`);
    await page.goto("/import");
    await nahraj(page, "zakazky.xlsx", sesit({ Zakázky: tabulkaSChybami(p) }));
    await expect(page.getByRole("status")).toHaveText("Načteno 6 řádků z listu „Zakázky“.");

    await page.getByRole("button", { name: "Zkontrolovat řádky" }).click();
    await expect(souhrn(page)).toHaveText(
      "Bez chyb: 3 řádky. S chybou: 3 řádky. Noví zákazníci: 1.",
    );
    // Řádky 2 a 4 jsou bez poznámek, v seznamu nejsou (+ řádek záhlaví).
    await expect(
      page.getByRole("region", { name: "Chyby a upozornění" }).getByRole("row"),
    ).toHaveCount(5);
    await expect(radekKontroly(page, 3)).toContainText(
      "Upozornění: Technik „Karel Neznámý“ v portálu není",
    );
    await expect(radekKontroly(page, 3)).toContainText(
      "Upozornění: Stav V práci potřebuje technika — zakázka bude Nová.",
    );
    await expect(radekKontroly(page, 5)).toContainText("Chyba: Chybí zákazník.");
    await expect(radekKontroly(page, 6)).toContainText("Termín „31. 2. 2026“ se nedá přečíst");
    await expect(radekKontroly(page, 6)).toContainText("hotová zakázka potřebuje zapsanou práci");
    await expect(radekKontroly(page, 7)).toContainText("Stav „vyřizuje se“ portál nezná");
    await bezVodorovnehoPosuvu(page);

    await page.getByRole("button", { name: "Uložit 3 zakázky, 3 řádky přeskočit" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Uloženo:" })).toHaveText(
      "Uloženo: 3 zakázky. Noví zákazníci: 1. Přeskočeno: 3 řádky s chybou.",
    );
    await expect(page.getByRole("button", { name: /^Uložit/ })).toHaveCount(0);
    await bezVodorovnehoPosuvu(page);

    const zakazky = await sql(
      `SELECT c.name, c.phone, o.status::text AS status,
              o."technicianId" IS NOT NULL AS technik,
              to_char(o."dueDate", 'YYYY-MM-DD') AS termin
       FROM zakazky o JOIN zakaznici c ON c.id = o."customerId"
       WHERE c.name LIKE $1 ORDER BY o.number`,
      [`%${p}`],
    );
    expect(zakazky).toEqual([
      {
        name: `Instalatérství Řezníček ${p}`,
        phone: "+420 777 123 456",
        status: "PRIDELENA",
        technik: true,
        termin: "2026-11-20",
      },
      {
        name: `Pekárna Nová ${p}`,
        phone: "777 111 222",
        status: "NOVA",
        technik: false,
        termin: "2026-11-25",
      },
      {
        name: `Pekárna Nová ${p}`,
        phone: "777 111 222",
        status: "NOVA",
        technik: false,
        termin: null,
      },
    ]);
    const historie = await sql(
      `SELECT h.entity, count(*)::int AS pocet FROM historie h
       WHERE h.detail = 'Import z Excelu' AND h."entityId" IN (
         SELECT id FROM zakaznici WHERE name LIKE $1
         UNION SELECT o.id FROM zakazky o JOIN zakaznici c ON c.id = o."customerId"
               WHERE c.name LIKE $1)
       GROUP BY h.entity ORDER BY h.entity`,
      [`%${p}`],
    );
    expect(historie).toEqual([
      { entity: "zakazka", pocet: 3 },
      { entity: "zakaznik", pocet: 1 },
    ]);

    // Zakázka je u spárovaného zákazníka.
    await page.goto(existujici.adresa);
    await expect(page.getByText("Kape kohoutek")).toBeVisible();
  },
);

test("když žádný řádek nejde uložit, Uložit chybí; změna přiřazení kontrolu zruší", async ({
  page,
}) => {
  const p = pripona();
  await prihlas(page, UCTY.majitel.email);
  await page.goto("/import");
  await nahraj(
    page,
    "z.xlsx",
    sesit({
      List1: [
        ["Firma", "Adresa", "Závada", "Stav"],
        [`Firma ${p}`, "Liberec 1", "Oprava", "Vyfakturováno"],
      ],
    }),
  );
  await page.getByRole("button", { name: "Zkontrolovat řádky" }).click();
  await expect(souhrn(page)).toHaveText("Bez chyb: 0 řádků. S chybou: 1 řádek.");
  await expect(radekKontroly(page, 2)).toContainText("vyfakturovanou zakázku označuje jen Majitel");
  await expect(page.getByText("Žádný řádek nejde uložit.")).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await expect(page.getByRole("button", { name: /^Uložit/ })).toHaveCount(0);

  // Bez sloupce Stav projde — stará kontrola po změně přiřazení zmizí.
  await page.getByLabel("Stav").selectOption("");
  await expect(souhrn(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Zkontrolovat řádky" }).click();
  await expect(souhrn(page)).toHaveText("Bez chyb: 1 řádek. S chybou: 0 řádků. Noví zákazníci: 1.");
  await expect(page.getByRole("button", { name: "Uložit 1 zakázku" })).toBeVisible();
});

test("vzorový soubor stáhne Majitel i Dispečer a portál ho přečte celý; Technik ne", async ({
  page,
  browser,
}) => {
  await prihlas(page, UCTY.majitel.email);
  await page.goto("/import");
  const [stazeni] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Stáhnout vzorový soubor" }).click(),
  ]);
  expect(stazeni.suggestedFilename()).toBe("vzor-importu.xlsx");

  // Vzor se načte a všechny sloupce se přiřadí samy.
  await page.getByLabel("Tabulka Excelu").setInputFiles(await stazeni.path());
  await page.getByRole("button", { name: "Načíst tabulku" }).click();
  await expect(page.getByRole("status")).toHaveText("Načteno 2 řádky z listu „Zakázky“.");
  const ocekavane = [
    "Zákazník",
    "Telefon",
    "E-mail",
    "Místo výjezdu",
    "Co je potřeba udělat",
    "Termín",
    "Stav",
    "Technik",
  ];
  for (const [index, pole] of ocekavane.entries()) {
    await expect(page.getByLabel(pole)).toHaveValue(String(index));
  }
  await page.getByRole("button", { name: "Zkontrolovat řádky" }).click();
  await expect(souhrn(page)).toContainText("Bez chyb: 2 řádky. S chybou: 0 řádků.");

  const dispecer = await prihlasJinde(browser, UCTY.dispecer.email);
  expect((await dispecer.request.get("/import/vzor")).status()).toBe(200);
  await dispecer.context().close();

  const technik = await prihlasJinde(browser, UCTY.technik.email);
  expect((await technik.request.get("/import/vzor")).status()).toBe(404);
  await technik.context().close();

  // Neplatná cookie projde přes proxy až k obsluze adresy → 401.
  const host = await browser.newContext();
  const bezPrihlaseni = await host.request.get("/import/vzor", {
    headers: { cookie: "better-auth.session_token=neplatny" },
    maxRedirects: 0,
  });
  expect(bezPrihlaseni.status()).toBe(401);
  await host.close();
});

test("technik neuloží import ani napřímo", async ({ page, browser }) => {
  const p = pripona();
  const nazev = `Firma přímé volání ${p}`;
  const radky = [
    ["Firma", "Adresa", "Závada"],
    [nazev, "Liberec 1", "Oprava kotle"],
  ];
  await prihlas(page, UCTY.dispecer.email);
  await page.goto("/import");
  await nahraj(page, "z.xlsx", sesit({ List1: radky }));
  await page.getByRole("button", { name: "Zkontrolovat řádky" }).click();
  const [pozadavek] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    page.getByRole("button", { name: "Uložit 1 zakázku" }).click(),
  ]);
  await expect(page.getByRole("status").filter({ hasText: "Uloženo:" })).toBeVisible();

  // Tělo jako v testu 3A: argument FormData ("$K1"), pole s předponou "_1_".
  const telo = new FormData();
  telo.append(
    "_1_soubor",
    new Blob([new Uint8Array(sesit({ List1: radky }))], { type: XLSX }),
    "z.xlsx",
  );
  telo.append("_1_list", "List1");
  telo.append(
    "_1_prirazeni",
    JSON.stringify({
      zakaznik: 0,
      telefon: null,
      email: null,
      misto: 1,
      popis: 2,
      termin: null,
      stav: null,
      technik: null,
    }),
  );
  telo.append("0", '["$K1"]');
  const technik = await prihlasJinde(browser, UCTY.technik.email);
  const odpoved = await technik.request.post("/import", {
    headers: {
      "next-action": pozadavek.headers()["next-action"],
      origin: new URL(pozadavek.url()).origin,
      accept: "text/x-component",
    },
    multipart: telo,
  });
  expect(odpoved.status()).toBe(404);
  await technik.context().close();

  const pocet = await sql(
    `SELECT count(*)::int AS pocet FROM zakazky o JOIN zakaznici c ON c.id = o."customerId"
     WHERE c.name = $1`,
    [nazev],
  );
  expect(pocet).toEqual([{ pocet: 1 }]);
});
