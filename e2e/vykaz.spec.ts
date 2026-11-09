import { expect, test, type Page, type Request } from "@playwright/test";

import {
  bezVodorovnehoPosuvu,
  chybaFormulare,
  novaZakazka,
  prihlas,
  prihlasJinde,
  sql,
  stavZakazky,
  TELEFON,
  UCTY,
  zapisPraci,
} from "./pomocne";

// Krok 2C: výkaz (práce a materiál). Oprávnění (Jakub, 8. 11. 2026):
// - Technik zapisuje jen u své zakázky, mění a maže jen své řádky,
//   a jen dokud zakázka není Hotová,
// - Majitel a Dispečer zapisují, mění a mažou u každé zakázky,
// - u Vyfakturované výkaz nemění nikdo,
// - Hotovo jde dát jen se zapsanou prací; poslední práci hotové zakázky
//   smazat nejde.

/** Dispečer (nebo kdo je přihlášený) přidělí otevřenou zakázku technikovi. */
async function pridelTechnikovi(page: Page) {
  await page.getByLabel("Technik").selectOption({ label: UCTY.technik.jmeno });
  await page.getByRole("button", { name: "Uložit přidělení" }).click();
  await expect(stavZakazky(page)).toHaveText("Přidělená");
}

async function zmenStavNa(page: Page, stav: string) {
  await page.getByLabel("Změnit stav na").selectOption({ label: stav });
  await page.getByRole("button", { name: "Změnit stav" }).click();
}

function vykaz(page: Page) {
  return page.getByRole("region", { name: "Výkaz" });
}

function radek(page: Page, seznam: "Práce" | "Materiál", text: string) {
  return vykaz(page)
    .getByRole("list", { name: seznam })
    .getByRole("listitem")
    .filter({ hasText: text });
}

/** Zakázka přidělená technikovi, kterou technik rovnou začal. Vrací adresu. */
async function zakazkaTechnika(page: Page, browser: import("@playwright/test").Browser) {
  const dispecer = await prihlasJinde(browser, UCTY.dispecer.email);
  const { adresa } = await novaZakazka(dispecer);
  await pridelTechnikovi(dispecer);
  await dispecer.context().close();
  await prihlas(page, UCTY.technik.email);
  await page.goto(adresa);
  await page.getByRole("button", { name: "Začít práci" }).click();
  await expect(stavZakazky(page)).toHaveText("V práci");
  return adresa;
}

test(
  "technik na telefonu zapíše práci a materiál, upraví je, smaže a dokončí zakázku",
  TELEFON,
  async ({ page, browser }) => {
    await zakazkaTechnika(page, browser);

    // Bez práce Hotovo nejde.
    await expect(page.getByText("Před dokončením zapište práci do výkazu níže.")).toBeVisible();
    await page.getByRole("button", { name: "Hotovo" }).click();
    await expect(chybaFormulare(page)).toHaveText("Nejdřív zapište do výkazu odvedenou práci.");
    await expect(stavZakazky(page)).toHaveText("V práci");

    // Práce.
    await zapisPraci(page, "1", "30", "Výměna termostatu, odvzdušnění radiátorů.");
    await expect(radek(page, "Práce", "Výměna termostatu")).toContainText("1 h 30 min");
    await expect(radek(page, "Práce", "Výměna termostatu")).toContainText(
      `Zapsáno: ${UCTY.technik.jmeno}`,
    );
    await expect(vykaz(page).getByText("Odpracováno celkem:")).toContainText("1 h 30 min");

    // Materiál s desetinnou čárkou.
    await page.getByRole("button", { name: "Zapsat materiál" }).click();
    const formular = page.getByRole("form", { name: "Zapsat materiál" });
    await formular.getByLabel("Materiál").fill("Měděná trubka 15 mm");
    await formular.getByLabel("Množství").fill("1,5");
    await formular.getByLabel("Jednotka").selectOption("m");
    await bezVodorovnehoPosuvu(page);
    await formular.getByRole("button", { name: "Uložit materiál" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Materiál zapsán." })).toBeVisible();
    await expect(radek(page, "Materiál", "Měděná trubka")).toContainText("1,5 m");

    // Úprava práce.
    await radek(page, "Práce", "Výměna termostatu")
      .getByRole("button", { name: "Upravit" })
      .click();
    const uprava = page.getByRole("form", { name: "Upravit práci" });
    await expect(uprava.getByLabel("Hodin")).toHaveValue("1");
    await uprava.getByLabel("Minut").fill("45");
    await uprava.getByRole("button", { name: "Uložit změny" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Práce upravena." })).toBeVisible();
    await expect(radek(page, "Práce", "Výměna termostatu")).toContainText("1 h 45 min");

    // Smazání materiálu s potvrzením.
    await radek(page, "Materiál", "Měděná trubka").getByRole("button", { name: "Smazat" }).click();
    const okno = page.getByRole("dialog", { name: "Smazat materiál: Měděná trubka 15 mm?" });
    await expect(okno).toContainText("Tuto akci nelze vzít zpět.");
    await expect(okno.getByRole("button", { name: "Zrušit" })).toBeVisible();
    await okno.getByRole("button", { name: "Ano, smazat materiál" }).click();
    await expect(okno).toBeHidden();
    await expect(vykaz(page).getByText("Zatím není zapsaný žádný materiál.")).toBeVisible();

    await bezVodorovnehoPosuvu(page);

    // Hotovo — pak už technik výkaz nemění.
    await page.getByRole("button", { name: "Hotovo" }).click();
    await expect(stavZakazky(page)).toHaveText("Hotová");
    await expect(vykaz(page).getByText("výkaz už měnit nemůžete")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Zapsat práci|Zapsat materiál|Upravit|Smazat/ }),
    ).toHaveCount(0);
    await expect(page.getByText("Výkaz: přidána práce")).toBeVisible();
    await expect(page.getByText("Výkaz: smazán materiál")).toBeVisible();
  },
);

test("dispečer opraví hotovou zakázku, poslední práci smazat nejde, vyfakturovanou nikdo", async ({
  page,
  browser,
}) => {
  await prihlas(page, UCTY.dispecer.email);
  const { adresa } = await novaZakazka(page);
  await pridelTechnikovi(page);
  await zmenStavNa(page, "V práci");
  await expect(stavZakazky(page)).toHaveText("V práci");

  // Ani dispečer nedá Hotová bez práce.
  await zmenStavNa(page, "Hotová");
  await expect(chybaFormulare(page)).toHaveText("Nejdřív zapište do výkazu odvedenou práci.");
  await zapisPraci(page, "2", "0", "Montáž podle telefonického popisu technika.");
  await zmenStavNa(page, "Hotová");
  await expect(stavZakazky(page)).toHaveText("Hotová");

  // Poslední práci hotové zakázky smazat nejde — okno zůstane otevřené.
  await radek(page, "Práce", "Montáž podle").getByRole("button", { name: "Smazat" }).click();
  const okno = page.getByRole("dialog", { name: /^Smazat práci ze dne/ });
  await okno.getByRole("button", { name: "Ano, smazat práci" }).click();
  await expect(okno.getByRole("alert")).toHaveText(
    "Hotová zakázka musí mít zapsanou aspoň jednu práci.",
  );
  await okno.getByRole("button", { name: "Zrušit" }).click();
  await expect(okno).toBeHidden();

  // Dispečer u hotové zakázky dopíše druhou práci; pak první smazat jde.
  await zapisPraci(page, "0", "30", "Doplnění: kontrola po montáži.");
  await radek(page, "Práce", "Montáž podle").getByRole("button", { name: "Smazat" }).click();
  await page
    .getByRole("dialog", { name: /^Smazat práci ze dne/ })
    .getByRole("button", {
      name: "Ano, smazat práci",
    })
    .click();
  await expect(radek(page, "Práce", "Montáž podle")).toHaveCount(0);
  await expect(vykaz(page).getByText("Odpracováno celkem:")).toContainText("30 min");

  // Majitel vyfakturuje — výkaz pak nemění nikdo.
  const majitel = await prihlasJinde(browser, UCTY.majitel.email);
  await majitel.goto(adresa);
  await zmenStavNa(majitel, "Vyfakturovaná");
  await expect(stavZakazky(majitel)).toHaveText("Vyfakturovaná");
  await expect(
    vykaz(majitel).getByText("Zakázka je vyfakturovaná, výkaz už nejde měnit."),
  ).toBeVisible();
  await expect(vykaz(majitel).getByRole("button")).toHaveCount(0);
  await majitel.context().close();
});

test("neplatné údaje výkaz nepřijme", async ({ page, browser }) => {
  await zakazkaTechnika(page, browser);

  await page.getByRole("button", { name: "Zapsat práci" }).click();
  const prace = page.getByRole("form", { name: "Zapsat práci" });
  await prace.getByLabel("Co se dělalo").fill("Prohlídka bez zásahu.");
  await prace.getByRole("button", { name: "Uložit práci" }).click();
  await expect(prace.getByRole("alert")).toHaveText("Zadejte odpracovaný čas (nejvýš 24 h).");
  await prace.getByRole("button", { name: "Zrušit" }).click();

  await page.getByRole("button", { name: "Zapsat materiál" }).click();
  const material = page.getByRole("form", { name: "Zapsat materiál" });
  await material.getByLabel("Materiál").fill("Těsnění");
  await material.getByLabel("Množství").fill("hodně");
  await material.getByRole("button", { name: "Uložit materiál" }).click();
  await expect(material.getByRole("alert")).toHaveText(
    "Množství zadejte kladným číslem (nejvýš 2 desetinná místa).",
  );
  await expect(vykaz(page).getByText("Zatím není zapsaná žádná práce.")).toBeVisible();
});

/** Přehraje zachycený požadavek serverové akce s jiným tělem. */
function prehraj(page: Page, pozadavek: Request, telo: string) {
  return page.request.post(pozadavek.url(), {
    headers: {
      "next-action": pozadavek.headers()["next-action"],
      "content-type": pozadavek.headers()["content-type"] ?? "text/plain;charset=UTF-8",
      origin: new URL(pozadavek.url()).origin,
    },
    data: telo,
  });
}

test("technik nezapíše do cizí zakázky ani nesmaže cizí řádek ani napřímo", async ({
  page,
  browser,
}) => {
  const adresa = await zakazkaTechnika(page, browser);
  const zakazkaId = adresa.split("/").pop()!;

  // Dispečer do technikovy zakázky dopíše řádek — technik ho vidí, ale nemění.
  const dispecer = await prihlasJinde(browser, UCTY.dispecer.email);
  await dispecer.goto(adresa);
  await zapisPraci(dispecer, "0", "20", "Telefonická konzultace dispečera.");
  await dispecer.context().close();
  await page.reload();
  await expect(radek(page, "Práce", "Telefonická konzultace")).toBeVisible();
  await expect(radek(page, "Práce", "Telefonická konzultace").getByRole("button")).toHaveCount(0);

  // Technik zapíše vlastní řádek — požadavek zkusí na cizí zakázku.
  await page.getByRole("button", { name: "Zapsat práci" }).click();
  const formular = page.getByRole("form", { name: "Zapsat práci" });
  await formular.getByLabel("Hodin").fill("1");
  await formular.getByLabel("Co se dělalo").fill("Vlastní práce technika.");
  const [pridani] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    formular.getByRole("button", { name: "Uložit práci" }).click(),
  ]);
  await expect(radek(page, "Práce", "Vlastní práce technika.")).toBeVisible();
  await prehraj(page, pridani, (pridani.postData() ?? "").replace(zakazkaId, "seed-zakazka-1"));
  const cizi = await sql('SELECT count(*)::int AS n FROM vykaz_prace WHERE "orderId" = $1', [
    "seed-zakazka-1",
  ]);
  expect(cizi[0].n).toBe(0);

  // Smazání vlastního řádku — požadavek zkusí na řádek dispečera.
  const [{ id: radekDispecera }] = await sql(
    'SELECT id FROM vykaz_prace WHERE "orderId" = $1 AND note = $2',
    [zakazkaId, "Telefonická konzultace dispečera."],
  );
  const [{ id: vlastni }] = await sql(
    'SELECT id FROM vykaz_prace WHERE "orderId" = $1 AND note = $2',
    [zakazkaId, "Vlastní práce technika."],
  );
  await radek(page, "Práce", "Vlastní práce technika.")
    .getByRole("button", { name: "Smazat" })
    .click();
  const [smazani] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    page.getByRole("dialog").getByRole("button", { name: "Ano, smazat práci" }).click(),
  ]);
  await expect(radek(page, "Práce", "Vlastní práce technika.")).toHaveCount(0);
  await prehraj(page, smazani, (smazani.postData() ?? "").replace(vlastni, radekDispecera));
  const [zustal] = await sql('SELECT "deletedAt" FROM vykaz_prace WHERE id = $1', [radekDispecera]);
  expect(zustal.deletedAt).toBeNull();
});
