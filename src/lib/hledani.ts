import { z } from "zod";

/**
 * Hledání bez diakritiky (krok 2A). Do sloupce `search` se ukládá text
 * malými písmeny bez háčků a čárek, hledaný výraz se upraví stejně —
 * „novak“ i „NOVÁK“ najdou „Novák“. Jediné místo, kde se to skládá;
 * nové hledací pole napoj sem.
 */
export function bezDiakritiky(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Hodnota sloupce `search` z několika polí (prázdná se vynechají). */
export function hledaciText(...pole: (string | number | null | undefined)[]): string {
  return bezDiakritiky(pole.filter((p) => p !== null && p !== undefined && p !== "").join(" "));
}

/**
 * Hledaný výraz z adresy (`?q=`). Rozbitá nebo dlouhá hodnota obrazovku
 * neshodí — tiše se nahradí prázdnou.
 */
export const hledanySchema = z.string().trim().max(100).catch("");

export function precti(hodnota: string | string[] | undefined): string {
  return hledanySchema.parse(Array.isArray(hodnota) ? hodnota[0] : (hodnota ?? ""));
}
