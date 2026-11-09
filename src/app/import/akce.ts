"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prectiTabulku, type Tabulka } from "@/lib/import-excel";
import { prirazeniSchema, type KontrolaRadku, type VysledekKontroly } from "@/lib/import-kontrola";
import type { Prirazeni } from "@/lib/import-pole";
import { ulozImport as ulozRadky, zkontrolujImport as zkontrolujRadky } from "@/lib/import-ulozeni";
import { vyzadujRoli } from "@/lib/sezeni";
import type { Vysledek } from "@/lib/uzivatele";

/*
 * Import z Excelu (kroky 3A a 3B). Oprávnění (Jakub, 8. 11. 2026): nahrát,
 * zkontrolovat i uložit smí **Majitel a Dispečer**, Technik dostane 404
 * i při přímém volání, nepřihlášený jde na přihlášení. **Soubor se nikam
 * neukládá** — každá akce ho jen přečte (src/lib/import-excel.ts); kontrola
 * i uložení ho dostanou znovu a server si ho přečte sám, nevěří tabulce
 * z prohlížeče.
 *
 * Soubor s "use server" smí vyvážet jen asynchronní funkce.
 */

const vstupSchema = z.object({
  soubor: z.instanceof(File, { message: "Vyberte soubor." }),
  list: z.string().trim().max(200).nullable(),
});

async function prectiVstup(vstup: FormData): Promise<Vysledek<{ tabulka: Tabulka }>> {
  if (!(vstup instanceof FormData)) return { ok: false, chyba: "Vyberte soubor." };
  const udaje = vstupSchema.safeParse({
    soubor: vstup.get("soubor"),
    list: vstup.get("list") || null,
  });
  if (!udaje.success)
    return { ok: false, chyba: udaje.error.issues[0]?.message ?? "Vyberte soubor." };
  const data = new Uint8Array(await udaje.data.soubor.arrayBuffer());
  return prectiTabulku(data, udaje.data.list);
}

/** Soubor + přiřazení sloupců (JSON v poli `prirazeni`). */
async function prectiVstupSPrirazenim(
  vstup: FormData,
): Promise<Vysledek<{ tabulka: Tabulka; prirazeni: Prirazeni }>> {
  const nacteno = await prectiVstup(vstup);
  if (!nacteno.ok) return nacteno;
  const text = vstup.get("prirazeni");
  let json: unknown = null;
  try {
    json = typeof text === "string" && text.length <= 2000 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const prirazeni = prirazeniSchema.safeParse(json);
  if (!prirazeni.success) {
    return { ok: false, chyba: prirazeni.error.issues[0]?.message ?? "Přiřaďte sloupce." };
  }
  const sloupcu = nacteno.tabulka.zahlavi.length;
  if (Object.values(prirazeni.data).some((i) => i !== null && i >= sloupcu)) {
    return { ok: false, chyba: "Přiřazení neodpovídá tabulce. Načtěte ji znovu." };
  }
  return { ok: true, tabulka: nacteno.tabulka, prirazeni: prirazeni.data };
}

export async function nactiExcel(vstup: FormData): Promise<Vysledek<{ tabulka: Tabulka }>> {
  await vyzadujRoli("MAJITEL", "DISPECER");
  return prectiVstup(vstup);
}

export async function zkontrolujImport(
  vstup: FormData,
): Promise<Vysledek<{ radky: KontrolaRadku[]; souhrn: VysledekKontroly["souhrn"] }>> {
  await vyzadujRoli("MAJITEL", "DISPECER");
  const udaje = await prectiVstupSPrirazenim(vstup);
  if (!udaje.ok) return udaje;
  const { radky, souhrn } = await zkontrolujRadky(udaje.tabulka, udaje.prirazeni);
  // Do okna jen řádky, ke kterým je co říct.
  return {
    ok: true,
    radky: radky.filter((r) => r.chyby.length > 0 || r.upozorneni.length > 0),
    souhrn,
  };
}

export async function ulozImport(
  vstup: FormData,
): Promise<Vysledek<{ zakazek: number; zakazniku: number; preskoceno: number }>> {
  const kdo = await vyzadujRoli("MAJITEL", "DISPECER");
  const udaje = await prectiVstupSPrirazenim(vstup);
  if (!udaje.ok) return udaje;
  const vysledek = await ulozRadky(kdo, udaje.tabulka, udaje.prirazeni);
  if (vysledek.ok) {
    revalidatePath("/");
    revalidatePath("/zakaznici");
  }
  return vysledek;
}
