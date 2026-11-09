import type { Stav } from "@/lib/stavy";

/**
 * Pravidla výkazu (krok 2C) bez databáze — smí i do prohlížeče, kde jen
 * skrývají tlačítka. Skutečnou kontrolu dělá `src/lib/vykaz.ts`.
 *
 * Oprávnění (Jakub, 8. 11. 2026):
 * - **Technik** zapisuje jen u své zakázky a mění a maže **jen své řádky**,
 *   a to **jen dokud zakázka není Hotová** (Přidělená, V práci),
 * - **Majitel a Dispečer** zapisují, mění a mažou u každé zakázky,
 * - **u Vyfakturované výkaz nemění nikdo** (podle něj odešla faktura),
 * - Hotovo jde dát jen se zapsaným aspoň jedním řádkem práce.
 */

type Role = "MAJITEL" | "DISPECER" | "TECHNIK";

/** Jednotky materiálu (pevný výčet). */
export const JEDNOTKY = ["ks", "m", "kg", "l", "bal"] as const;
export type Jednotka = (typeof JEDNOTKY)[number];

/** Stavy, ve kterých technik smí výkaz měnit. */
const STAVY_TECHNIKA: readonly Stav[] = ["PRIDELENA", "V_PRACI"];

/** Stavy, do kterých se nejde dostat bez zapsané práce. */
export const STAVY_S_PRACI: readonly Stav[] = ["HOTOVA", "VYFAKTUROVANA"];

/** Smí tahle role u zakázky v tomhle stavu do výkazu zapisovat? */
export function smiPsatDoVykazu(role: Role, stav: Stav): boolean {
  if (stav === "VYFAKTUROVANA") return false;
  if (role === "TECHNIK") return STAVY_TECHNIKA.includes(stav);
  return true;
}

/** Smí měnit a mazat tenhle řádek? Technik jen své. */
export function smiMenitRadek(
  kdo: { id: string; role: Role },
  stav: Stav,
  zapsal: string,
): boolean {
  return smiPsatDoVykazu(kdo.role, stav) && (kdo.role !== "TECHNIK" || zapsal === kdo.id);
}

/** „2 h 30 min“, „45 min“, „3 h“. */
export function delka(minuty: number): string {
  const h = Math.floor(minuty / 60);
  const m = minuty % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Dnešní den v Praze (`RRRR-MM-DD`) — výchozí hodnota formuláře i horní mez. */
export function dnesVPraze(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Množství pro zobrazení: „2“, „1,5“. */
export const MNOZSTVI = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });

/** Den `RRRR-MM-DD` česky („8. 11. 2026“) bez převodu pásma. */
export function denCesky(den: string): string {
  const [r, m, d] = den.split("-");
  return `${Number(d)}. ${Number(m)}. ${r}`;
}
