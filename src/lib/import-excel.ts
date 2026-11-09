import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import readXlsxFile from "read-excel-file/node";

import { LIMITY, pismenoSloupce } from "@/lib/import-pole";
import type { Vysledek } from "@/lib/uzivatele";

/**
 * Čtení nahraného Excelu (krok 3A). Oprávnění hlídá akce (Majitel
 * a Dispečer, Jakub 8. 11. 2026). **Soubor se nikam neukládá** (Jakub):
 * server ho jen přečte a vrátí tabulku textů do okna; do databáze se
 * zapíšou až potvrzené zakázky (krok 3B).
 *
 * Kontroly podle obsahu, ne podle přípony (pravidlo 11):
 * 1. velikost nejvýš 2 MB,
 * 2. první bajty musí být začátek archivu ZIP (tak vypadá každé .xlsx),
 * 3. **skutečná velikost po rozbalení** nejvýš 50 MB — spočítá se
 *    rozbalením po malých kouscích, takže „zip bomba“ (pár kB, po
 *    rozbalení gigabajty) nezahltí paměť dřív, než se odmítne,
 * 4. teprve pak ho přečte knihovna; co nepřečte, není tabulka .xlsx.
 */

export type Tabulka = {
  listy: string[];
  list: string;
  zahlavi: string[];
  radky: string[][];
  /** Číslo každého řádku v Excelu (prázdné řádky se vynechávají). */
  cisla: number[];
};

const NENI_XLSX = "Soubor se nepodařilo přečíst. Nahrajte tabulku ve formátu .xlsx.";

/** ZIP začíná podpisem „PK\x03\x04“. */
function jeZip(data: Uint8Array): boolean {
  return data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

/**
 * Rozbalí archiv naprázdno a sečte, kolik by zabral. Vstup se podává po
 * 16 kB, takže jeden krok vyrobí nejvýš ~16 MB (DEFLATE zhušťuje nejvýš
 * zhruba 1000:1) a po překročení limitu se hned skončí.
 */
export function kontrolaRozbaleni(data: Uint8Array): "ok" | "velky" | "vadny" {
  let celkem = 0;
  let souboru = 0;
  let vysledek: "ok" | "velky" | "vadny" = "ok";
  const unzip = new Unzip((soubor) => {
    souboru += 1;
    if (vysledek !== "ok") return;
    if (souboru > 1000) {
      vysledek = "vadny";
      return;
    }
    soubor.ondata = (chyba, kus) => {
      if (chyba) {
        vysledek = "vadny";
        return;
      }
      celkem += kus.length;
      if (celkem > LIMITY.rozbaleno && vysledek === "ok") {
        vysledek = "velky";
        soubor.terminate();
      }
    };
    try {
      soubor.start();
    } catch {
      // Neznámý způsob komprese — Excel používá jen DEFLATE a „bez komprese“.
      vysledek = "vadny";
    }
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  const KUS = 16 * 1024;
  try {
    for (let i = 0; i < data.length && vysledek === "ok"; i += KUS) {
      unzip.push(data.subarray(i, i + KUS), i + KUS >= data.length);
    }
  } catch {
    return "vadny";
  }
  return souboru === 0 ? "vadny" : vysledek;
}

/** Hodnota buňky jako text: datum `RRRR-MM-DD`, číslo bez formátování. */
function text(hodnota: unknown): string {
  if (hodnota === null || hodnota === undefined) return "";
  if (hodnota instanceof Date) {
    return Number.isNaN(hodnota.getTime()) ? "" : hodnota.toISOString().slice(0, 10);
  }
  if (typeof hodnota === "boolean") return hodnota ? "ano" : "ne";
  return String(hodnota).replace(/\s+/g, " ").trim().slice(0, LIMITY.delkaBunky);
}

export async function prectiTabulku(
  data: Uint8Array,
  pozadovanyList: string | null,
): Promise<Vysledek<{ tabulka: Tabulka }>> {
  if (data.length === 0) return { ok: false, chyba: "Soubor je prázdný." };
  if (data.length > LIMITY.velikost) {
    return { ok: false, chyba: "Soubor je větší než 2 MB." };
  }
  if (!jeZip(data)) return { ok: false, chyba: NENI_XLSX };
  const rozbaleni = kontrolaRozbaleni(data);
  if (rozbaleni === "velky") {
    return { ok: false, chyba: "Tabulka je po rozbalení příliš velká (víc než 50 MB)." };
  }
  if (rozbaleni === "vadny") return { ok: false, chyba: NENI_XLSX };

  let listy: Awaited<ReturnType<typeof readXlsxFile>>;
  try {
    listy = await readXlsxFile(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  } catch {
    return { ok: false, chyba: NENI_XLSX };
  }
  if (listy.length === 0) return { ok: false, chyba: NENI_XLSX };
  const nazvy = listy.map((l) => l.sheet);
  const vybrany = listy.find((l) => l.sheet === pozadovanyList) ?? listy[0];

  const neprazdne = vybrany.data
    .map((radek, i) => ({ cislo: i + 1, bunky: radek.map(text) }))
    .filter((r) => r.bunky.some((bunka) => bunka !== ""));
  const radky = neprazdne.map((r) => r.bunky);
  if (radky.length < 2) {
    return {
      ok: false,
      chyba: `List „${vybrany.sheet}“ nemá pod řádkem s názvy sloupců žádná data.`,
    };
  }
  const [hlavicka, ...telo] = radky;
  if (telo.length > LIMITY.radku) {
    return {
      ok: false,
      chyba: `Tabulka má ${telo.length} řádků, najednou jde nahrát nejvýš ${LIMITY.radku}. Rozdělte ji na menší části.`,
    };
  }
  const sloupcu = Math.max(...radky.map((r) => r.length));
  if (sloupcu > LIMITY.sloupcu) {
    return {
      ok: false,
      chyba: `Tabulka má ${sloupcu} sloupců, portál jich přečte nejvýš ${LIMITY.sloupcu}. Smažte nepotřebné sloupce.`,
    };
  }
  const doplnit = (r: string[]) => Array.from({ length: sloupcu }, (_, i) => r[i] ?? "");
  return {
    ok: true,
    tabulka: {
      listy: nazvy,
      list: vybrany.sheet,
      zahlavi: doplnit(hlavicka).map((z, i) => z || `Sloupec ${pismenoSloupce(i)}`),
      radky: telo.map(doplnit),
      cisla: neprazdne.slice(1).map((r) => r.cislo),
    },
  };
}
