import { z } from "zod";

import { bezDiakritiky } from "@/lib/hledani";
import type { Tabulka } from "@/lib/import-excel";
import { LIMITY, POLE_IMPORTU, type PoleImportu, type Prirazeni } from "@/lib/import-pole";
import { NAZEV_STAVU, type Stav } from "@/lib/stavy";
import { zakaznikSchema } from "@/lib/zakaznici";

/**
 * Kontrola řádků importu (krok 3B). Rozhodnutí Jakuba (8. 11. 2026):
 * - **zákazník se spáruje podle názvu** (bez ohledu na velikost písmen
 *   a diakritiku), jinak se založí nový — stejný nový název na víc
 *   řádcích = jeden zákazník,
 * - **technik se pozná podle jména**; nenalezený = jen upozornění,
 *   zakázka bude Nová bez technika,
 * - **import smí jen stavy Nová, Přidělená, V práci** — Hotová potřebuje
 *   zapsanou práci (krok 2C), Vyfakturovanou smí jen Majitel,
 * - **uloží se jen bezchybné řádky**, chybné se vypíšou s důvodem.
 *
 * Bez databáze: seznam zákazníků a techniků dostane od volajícího
 * (`src/lib/import-ulozeni.ts`), takže stejná pravidla platí při kontrole
 * i při uložení.
 */

/** Přiřazení sloupců z prohlížeče: každý údaj nejvýš jeden sloupec, sloupec nejvýš jednou. */
export const prirazeniSchema = z
  .object(
    Object.fromEntries(
      POLE_IMPORTU.map((p) => [
        p.id,
        z
          .number()
          .int()
          .min(0)
          .max(LIMITY.sloupcu - 1)
          .nullable(),
      ]),
    ) as Record<PoleImportu, z.ZodNullable<z.ZodNumber>>,
  )
  .strict()
  .refine((p) => {
    const pouzite = Object.values(p).filter((v) => v !== null);
    return new Set(pouzite).size === pouzite.length;
  }, "Jeden sloupec je přiřazený víckrát.")
  .refine(
    (p) => POLE_IMPORTU.every((pole) => !pole.povinne || p[pole.id] !== null),
    "Přiřaďte povinné údaje.",
  );

export type Kontext = {
  zakaznici: { id: string; name: string }[];
  technici: { id: string; name: string }[];
};

/** Co se z řádku uloží (jen u řádku bez chyb). */
export type PripravenyRadek = {
  cislo: number;
  zakaznik:
    | { druh: "existujici"; id: string }
    | { druh: "novy"; klic: string; jmeno: string; telefon: string | null; email: string | null };
  misto: string;
  popis: string;
  termin: Date | null;
  technikId: string | null;
  stav: Stav;
};

/** Výsledek jednoho řádku pro okno. */
export type KontrolaRadku = { cislo: number; chyby: string[]; upozorneni: string[] };

export type VysledekKontroly = {
  radky: KontrolaRadku[];
  pripravene: PripravenyRadek[];
  souhrn: {
    bezChyb: number;
    sChybou: number;
    prazdnych: number;
    novychZakazniku: number;
  };
};

/** Termín: `RRRR-MM-DD` (datum z Excelu) nebo `20. 11. 2026` / `20.11.2026`. */
export function prectiTermin(text: string): Date | null | "chyba" {
  if (text === "") return null;
  let rok: number, mesic: number, den: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const cesky = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/.exec(text);
  if (iso) [rok, mesic, den] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (cesky) [den, mesic, rok] = [Number(cesky[1]), Number(cesky[2]), Number(cesky[3])];
  else return "chyba";
  if (rok < 2000 || rok > 2100) return "chyba";
  const datum = new Date(Date.UTC(rok, mesic - 1, den));
  if (datum.getUTCMonth() !== mesic - 1 || datum.getUTCDate() !== den) return "chyba";
  return datum;
}

/** Text stavu z tabulky → stav portálu, nebo důvod, proč nejde. */
const STAV_Z_TEXTU: Record<string, Stav | "hotova" | "vyfakturovana"> = {
  nova: "NOVA",
  novy: "NOVA",
  nove: "NOVA",
  nezahajena: "NOVA",
  ceka: "NOVA",
  pridelena: "PRIDELENA",
  prideleno: "PRIDELENA",
  pridelen: "PRIDELENA",
  naplanovana: "PRIDELENA",
  naplanovano: "PRIDELENA",
  "v praci": "V_PRACI",
  rozpracovana: "V_PRACI",
  rozpracovano: "V_PRACI",
  probiha: "V_PRACI",
  hotova: "hotova",
  hotovo: "hotova",
  dokoncena: "hotova",
  dokonceno: "hotova",
  splneno: "hotova",
  vyfakturovana: "vyfakturovana",
  vyfakturovano: "vyfakturovana",
  fakturovano: "vyfakturovana",
};

const POVOLENE_STAVY = `${NAZEV_STAVU.NOVA}, ${NAZEV_STAVU.PRIDELENA} nebo ${NAZEV_STAVU.V_PRACI}`;

function najdiTechnika(jmeno: string, technici: Kontext["technici"]) {
  const hledane = bezDiakritiky(jmeno);
  const obracene = hledane.split(" ").reverse().join(" ");
  return technici.filter((t) => {
    const n = bezDiakritiky(t.name);
    return n === hledane || n === obracene;
  });
}

export function zkontrolujRadky(
  tabulka: Pick<Tabulka, "radky" | "cisla">,
  prirazeni: Prirazeni,
  kontext: Kontext,
): VysledekKontroly {
  const zakazniciPodleNazvu = new Map<string, string[]>();
  for (const z of kontext.zakaznici) {
    const klic = bezDiakritiky(z.name);
    zakazniciPodleNazvu.set(klic, [...(zakazniciPodleNazvu.get(klic) ?? []), z.id]);
  }
  const novi = new Set<string>();
  const noviVTabulce = new Map<string, PripravenyRadek["zakaznik"]>();
  const radky: KontrolaRadku[] = [];
  const pripravene: PripravenyRadek[] = [];
  let prazdnych = 0;

  tabulka.radky.forEach((bunky, i) => {
    const cislo = tabulka.cisla[i];
    const hodnota = (pole: PoleImportu) => {
      const index = prirazeni[pole];
      return index === null ? "" : (bunky[index] ?? "").trim();
    };
    if (POLE_IMPORTU.every((p) => hodnota(p.id) === "")) {
      prazdnych++;
      return;
    }
    const chyby: string[] = [];
    const upozorneni: string[] = [];

    // Povinné údaje a jejich délka (stejné limity jako formuláře).
    const jmeno = hodnota("zakaznik");
    const misto = hodnota("misto");
    const popis = hodnota("popis");
    if (jmeno === "") chyby.push("Chybí zákazník.");
    else if (jmeno.length < 2 || jmeno.length > 150)
      chyby.push("Název zákazníka musí mít 2 až 150 znaků.");
    if (misto === "") chyby.push("Chybí místo výjezdu.");
    else if (misto.length < 3 || misto.length > 200)
      chyby.push("Místo výjezdu musí mít 3 až 200 znaků.");
    if (popis === "") chyby.push("Chybí popis, co je potřeba udělat.");
    else if (popis.length < 3) chyby.push("Popis musí mít aspoň 3 znaky.");
    else if (popis.length > 2000) chyby.push("Popis může mít nejvýš 2000 znaků.");

    // Termín.
    const terminText = hodnota("termin");
    const termin = prectiTermin(terminText);
    if (termin === "chyba") {
      chyby.push(`Termín „${terminText}“ se nedá přečíst. Použijte datum, např. 20. 11. 2026.`);
    }

    // Zákazník: spárovat podle názvu, jinak založit.
    let zakaznik: PripravenyRadek["zakaznik"] | null = null;
    if (jmeno.length >= 2 && jmeno.length <= 150) {
      const klic = bezDiakritiky(jmeno);
      const shoda = zakazniciPodleNazvu.get(klic) ?? [];
      if (shoda.length > 1) {
        chyby.push(
          `V portálu je víc zákazníků s názvem „${jmeno}“. Tuto zakázku založte ručně, ať se přiřadí ke správnému.`,
        );
      } else if (shoda.length === 1) {
        zakaznik = { druh: "existujici", id: shoda[0] };
      } else if (noviVTabulce.has(klic)) {
        // Stejný nový zákazník už byl na dřívějším řádku — údaje se berou
        // odtamtud (jeden zákazník), upozornění jen u prvního výskytu.
        zakaznik = noviVTabulce.get(klic)!;
      } else {
        const telefonText = hodnota("telefon");
        const emailText = hodnota("email");
        const telefon = zakaznikSchema.shape.telefon.safeParse(telefonText);
        const email = zakaznikSchema.shape.email.safeParse(emailText);
        if (!telefon.success) {
          upozorneni.push(`Telefon „${telefonText}“ není platný — zákazník se uloží bez něj.`);
        }
        if (!email.success) {
          upozorneni.push(`E-mail „${emailText}“ není platný — zákazník se uloží bez něj.`);
        }
        zakaznik = {
          druh: "novy",
          klic,
          jmeno,
          telefon: telefon.success ? telefon.data : null,
          email: email.success ? email.data : null,
        };
        noviVTabulce.set(klic, zakaznik);
      }
    }

    // Technik podle jména.
    let technikId: string | null = null;
    const technikText = hodnota("technik");
    if (technikText !== "") {
      const shoda = najdiTechnika(technikText, kontext.technici);
      if (shoda.length === 1) technikId = shoda[0].id;
      else if (shoda.length > 1)
        upozorneni.push(
          `Techniků se jménem „${technikText}“ je víc — zakázka bude bez technika, přidělte ho ručně.`,
        );
      else
        upozorneni.push(
          `Technik „${technikText}“ v portálu není — zakázka bude bez technika, přidělte ho ručně.`,
        );
    }

    // Stav: jen Nová, Přidělená, V práci. Prázdný podle technika.
    let stav: Stav = technikId ? "PRIDELENA" : "NOVA";
    const stavText = hodnota("stav");
    if (stavText !== "") {
      const rozpoznany = STAV_Z_TEXTU[bezDiakritiky(stavText)];
      if (rozpoznany === "hotova") {
        chyby.push(
          `Stav „${stavText}“ importovat nejde — hotová zakázka potřebuje zapsanou práci. Naimportujte ji jako V práci a práci zapište.`,
        );
      } else if (rozpoznany === "vyfakturovana") {
        chyby.push(
          `Stav „${stavText}“ importovat nejde — vyfakturovanou zakázku označuje jen Majitel u hotové zakázky.`,
        );
      } else if (!rozpoznany) {
        chyby.push(`Stav „${stavText}“ portál nezná. Použijte ${POVOLENE_STAVY}.`);
      } else if (rozpoznany === "NOVA") {
        // Přidělením technika se Nová mění na Přidělenou (jako v kroku 2B).
        stav = technikId ? "PRIDELENA" : "NOVA";
      } else if (!technikId) {
        upozorneni.push(
          `Stav ${NAZEV_STAVU[rozpoznany]} potřebuje technika — zakázka bude ${NAZEV_STAVU.NOVA}.`,
        );
        stav = "NOVA";
      } else {
        stav = rozpoznany;
      }
    }

    radky.push({ cislo, chyby, upozorneni });
    if (chyby.length === 0 && zakaznik && termin !== "chyba") {
      if (zakaznik.druh === "novy") novi.add(zakaznik.klic);
      pripravene.push({ cislo, zakaznik, misto, popis, termin, technikId, stav });
    }
  });

  return {
    radky,
    pripravene,
    souhrn: {
      bezChyb: pripravene.length,
      sChybou: radky.length - pripravene.length,
      prazdnych,
      novychZakazniku: novi.size,
    },
  };
}
