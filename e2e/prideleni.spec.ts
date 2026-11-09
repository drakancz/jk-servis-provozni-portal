import { expect, test } from "@playwright/test";

import { novaZakazka, prihlas, prihlasJinde, sql, stavZakazky, UCTY, zapisPraci } from "./pomocne";

// Krok 2B: přidělení a stavy. Oprávnění (Jakub, 8. 11. 2026):
// - technika přiděluje Majitel a Dispečer,
// - stav mění Majitel a Dispečer, „Vyfakturovaná“ jen Majitel,
// - Technik jen u své zakázky a jen dopředu (Začít práci → Hotovo),
// - Technik u své zakázky vidí kontakt zákazníka, cizí zakázka = 404.

const TECHNIK = UCTY.technik.jmeno;

const stav = stavZakazky;

test("celý průchod: přidělení, technik začne a dokončí, majitel vyfakturuje", async ({
  page,
  browser,
}) => {
  await prihlas(page, UCTY.dispecer.email);
  const { adresa, cislo, zakaznik } = await novaZakazka(page);
  await expect(stav(page)).toHaveText("Nová");

  // Dispečer přidělí technika → zakázka je Přidělená.
  await page.getByLabel("Technik").selectOption({ label: TECHNIK });
  await page.getByRole("button", { name: "Uložit přidělení" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Přidělení uloženo." })).toBeVisible();
  await expect(stav(page)).toHaveText("Přidělená");
  await expect(page.getByText(`Přidělení: technik ${TECHNIK}`)).toBeVisible();
  // Dispečer „Vyfakturovaná“ v nabídce nemá.
  await expect(
    page.getByLabel("Změnit stav na").locator("option", { hasText: "Vyfakturovaná" }),
  ).toHaveCount(0);

  // Technik ji najde v seznamu, vidí kontakt, ale ne úpravu ani kartu zákazníka.
  const technik = await prihlasJinde(browser, UCTY.technik.email);
  await technik.getByRole("link", { name: `Zakázka č. ${cislo}` }).click();
  await expect(technik.getByRole("link", { name: "+420 777 123 456" })).toHaveAttribute(
    "href",
    "tel:+420777123456",
  );
  await expect(technik.getByText(zakaznik)).toBeVisible();
  await expect(technik.getByRole("link", { name: zakaznik })).toHaveCount(0);
  await expect(technik.getByText("Upravit zakázku")).toHaveCount(0);
  await expect(technik.getByLabel("Technik")).toHaveCount(0);

  await technik.getByRole("button", { name: "Začít práci" }).click();
  await expect(stav(technik)).toHaveText("V práci");
  await zapisPraci(technik, "1", "30", "Výměna termostatu a zkouška topení.");
  await technik.getByRole("button", { name: "Hotovo" }).click();
  await expect(stav(technik)).toHaveText("Hotová");
  await expect(technik.getByRole("button", { name: /Začít práci|Hotovo/ })).toHaveCount(0);
  await expect(technik.getByText("Zakázka je hotová.")).toBeVisible();
  await technik.context().close();

  // Majitel vyfakturuje.
  const majitel = await prihlasJinde(browser, UCTY.majitel.email);
  await majitel.goto(adresa);
  await majitel.getByLabel("Změnit stav na").selectOption({ label: "Vyfakturovaná" });
  await majitel.getByRole("button", { name: "Změnit stav" }).click();
  await expect(stav(majitel)).toHaveText("Vyfakturovaná");
  await expect(majitel.getByText("Stav: Hotová → Vyfakturovaná")).toBeVisible();
  await expect(majitel.getByText("Stav: V práci → Hotová")).toBeVisible();
  await majitel.context().close();

  // Dispečer vyfakturovanou zakázku už měnit nesmí.
  await page.goto(adresa);
  await expect(page.getByLabel("Změnit stav na")).toHaveCount(0);
  await expect(page.getByText("Vyfakturovanou zakázku může změnit jen majitel.")).toBeVisible();
});

test("rozpracované zakázce technika odebrat nejde", async ({ page }) => {
  await prihlas(page, UCTY.dispecer.email);
  await novaZakazka(page);
  await page.getByLabel("Technik").selectOption({ label: TECHNIK });
  await page.getByRole("button", { name: "Uložit přidělení" }).click();
  await expect(stav(page)).toHaveText("Přidělená");
  await page.getByLabel("Změnit stav na").selectOption({ label: "V práci" });
  await page.getByRole("button", { name: "Změnit stav" }).click();
  await expect(stav(page)).toHaveText("V práci");

  await page.getByLabel("Technik").selectOption({ label: "— nepřiděleno —" });
  await page.getByRole("button", { name: "Uložit přidělení" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "technika odebrat nejde" })).toBeVisible();
  await expect(stav(page)).toHaveText("V práci");
});

test("filtr podle stavu ukáže jen zakázky v tom stavu", async ({ page }) => {
  await prihlas(page, UCTY.dispecer.email);
  await page
    .getByRole("navigation", { name: "Filtr podle stavu" })
    .getByRole("link", { name: "V práci" })
    .click();
  await expect(page).toHaveURL(/\?stav=V_PRACI$/);
  const stavy = page.getByRole("list", { name: "Seznam zakázek" }).locator("[data-stav]");
  await expect(stavy.first()).toBeVisible();
  for (const s of await stavy.allTextContents()) expect(s).toBe("V práci");
});

test("bez oprávnění nejde přidělit ani měnit stav ani napřímo", async ({ page, browser }) => {
  // Dispečer přidělí — zachytíme požadavek akce a zkusíme ho jako technik.
  await prihlas(page, UCTY.dispecer.email);
  const { adresa } = await novaZakazka(page);
  const zakazkaId = adresa.split("/").pop()!;
  await page.getByLabel("Technik").selectOption({ label: TECHNIK });
  const [prideleni] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    page.getByRole("button", { name: "Uložit přidělení" }).click(),
  ]);
  await expect(stav(page)).toHaveText("Přidělená");

  const technik = await prihlasJinde(browser, UCTY.technik.email);
  const hlavicky = (r: typeof prideleni) => ({
    "next-action": r.headers()["next-action"],
    "content-type": r.headers()["content-type"] ?? "text/plain;charset=UTF-8",
    origin: new URL(r.url()).origin,
  });
  const odpoved = await technik.request.post(adresa, {
    headers: hlavicky(prideleni),
    data: (prideleni.postData() ?? "").replace(/"[^"]*"\]$/, '""]'),
  });
  expect(odpoved.status()).toBe(404);

  // Technik „Začít práci“ u své zakázky — stejný požadavek pak zkusí
  // na cizí zakázku (seed-zakazka-1, nepřidělená). Nesmí se nic změnit.
  await technik.goto(adresa);
  const [krok] = await Promise.all([
    technik.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
    technik.getByRole("button", { name: "Začít práci" }).click(),
  ]);
  await expect(stav(technik)).toHaveText("V práci");
  const cizi = (krok.postData() ?? "")
    .replace(zakazkaId, "seed-zakazka-1")
    .replace("PRIDELENA", "NOVA");
  await technik.request.post("/zakazky/seed-zakazka-1", { headers: hlavicky(krok), data: cizi });
  const [radek] = await sql('SELECT status, "technicianId" FROM zakazky WHERE id = $1', [
    "seed-zakazka-1",
  ]);
  expect(radek.status).toBe("NOVA");
  expect(radek.technicianId).toBeNull();
  await technik.context().close();
});
