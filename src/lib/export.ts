import { cenaZakazkyBezDph } from "@/lib/ceny";
import { db } from "@/lib/db";
import { POLE_IMPORTU } from "@/lib/import-pole";
import type { Prihlaseny } from "@/lib/sezeni";
import { NAZEV_STAVU, type Stav } from "@/lib/stavy";
import { slozSesit, type Bunka } from "@/lib/xlsx-sestaveni";
import { DEN, podminkaSeznamu } from "@/lib/zakazky";

/**
 * Export zakázek do Excelu (krok 3C). Rozhodnutí Jakuba (8. 11. 2026):
 * - **stáhne ho Majitel a Dispečer** (jako import), Technik ne,
 * - **zakázky podle filtru seznamu** — hledání i stav, bez filtru všechny,
 * - **sloupce jako import + číslo a výkaz** (hodiny práce, položek
 *   materiálu). Soubor jde po úpravě nahrát zpět importem; sloupce navíc
 *   import nechá nepřiřazené.
 * Krok 4A (Jakub, 9. 11. 2026): navíc **Cena bez DPH** (práce + materiál
 * s cenou ze dne zápisu). Export stahují jen role, které ceny vidí.
 */

/** Nejvýš tolik zakázek v jednom souboru (seznam ukazuje 200). */
export const LIMIT_EXPORTU = 5000;

export const SLOUPCE_EXPORTU = [
  "Číslo",
  ...POLE_IMPORTU.map((p) => p.nazev),
  "Hodiny práce",
  "Položek materiálu",
  "Cena bez DPH",
];

export async function exportZakazek(kdo: Prihlaseny, hledany: string, stav: Stav | null) {
  const zakazky = await db.order.findMany({
    where: podminkaSeznamu(kdo, hledany, stav),
    orderBy: { number: "desc" },
    take: LIMIT_EXPORTU,
    select: {
      number: true,
      place: true,
      description: true,
      dueDate: true,
      status: true,
      customer: { select: { name: true, phone: true, email: true } },
      technician: { select: { name: true } },
      workEntries: { where: { deletedAt: null }, select: { minutes: true, hourlyRate: true } },
      materialEntries: {
        where: { deletedAt: null },
        select: { quantity: true, unitPrice: true },
      },
      _count: { select: { materialEntries: { where: { deletedAt: null } } } },
    },
  });

  const radky: Bunka[][] = zakazky.map((z) => [
    z.number,
    z.customer.name,
    z.customer.phone ?? "",
    z.customer.email ?? "",
    z.place,
    z.description,
    z.dueDate ? DEN.format(z.dueDate) : "",
    NAZEV_STAVU[z.status as Stav],
    z.technician?.name ?? "",
    Math.round((z.workEntries.reduce((s, p) => s + p.minutes, 0) / 60) * 100) / 100,
    z._count.materialEntries,
    cenaZakazkyBezDph(z.workEntries, z.materialEntries) / 100,
  ]);
  return slozSesit({ Zakázky: [SLOUPCE_EXPORTU, ...radky] }, 22);
}

/** Název souboru s dnešním pražským dnem: `zakazky-2026-11-08.xlsx`. */
export function nazevExportu(ted = new Date()): string {
  const den = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(ted);
  return `zakazky-${den}.xlsx`;
}
