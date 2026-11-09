import { z } from "zod";

import { db } from "@/lib/db";
import { zapisHistorii } from "@/lib/historie";
import type { Prihlaseny } from "@/lib/sezeni";
import { NAZEV_STAVU, smiZmenitStav, STAVY, STAVY_S_TECHNIKEM, type Stav } from "@/lib/stavy";
import type { Vysledek } from "@/lib/uzivatele";
import { STAVY_S_PRACI } from "@/lib/vykaz-pravidla";
import { maPraci } from "@/lib/vykaz";
import { zamkniZakazku } from "@/lib/zakazky";

/**
 * Přidělení a stavy zakázek (krok 2B). Oprávnění (Jakub, 8. 11. 2026):
 * - **přiděluje technika Majitel a Dispečer**,
 * - **stav mění Majitel a Dispečer** libovolně, kromě „Vyfakturovaná“ —
 *   tu nastaví i zruší **jen Majitel**,
 * - **Technik** jen u své zakázky a jen dopředu: Přidělená → V práci →
 *   Hotová (`KROK_TECHNIKA`); cizí zakázka pro něj neexistuje,
 * - stav od „Přidělená“ výš potřebuje technika, „Nová“ ho mít nesmí.
 * - Hotová a Vyfakturovaná potřebují zapsanou práci ve výkazu (krok 2C).
 * Kontrola role je první řádek každé akce; tady se hlídají pravidla.
 * Zápis je podmíněný stavem, který člověk viděl — souběžná změna se
 * nepřepíše.
 */

export const stavSchema = z.enum(STAVY);

const ZAKAZKA_NEEXISTUJE = "Zakázka neexistuje.";
const SOUBEH = "Zakázku mezitím změnil někdo jiný. Obnovte stránku.";

/** Aktivní technici do výběru u zakázky. */
export async function seznamTechniku() {
  return db.user.findMany({
    where: { role: "TECHNIK", deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function pridelTechnika(
  kdo: Prihlaseny,
  zakazkaId: string,
  technikId: string | null,
): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const zakazka = await tx.order.findFirst({
      where: { id: zakazkaId, deletedAt: null },
      select: { status: true, technicianId: true },
    });
    if (!zakazka) return { ok: false as const, chyba: ZAKAZKA_NEEXISTUJE };
    if (zakazka.technicianId === technikId) return { ok: true as const };
    if (zakazka.status === "VYFAKTUROVANA") {
      return { ok: false as const, chyba: "Vyfakturovanou zakázku už přidělit jinému nejde." };
    }

    let jmeno: string | null = null;
    if (technikId) {
      const technik = await tx.user.findFirst({
        where: { id: technikId, role: "TECHNIK", deletedAt: null },
        select: { name: true },
      });
      if (!technik) return { ok: false as const, chyba: "Vybraný technik už v portálu není." };
      jmeno = technik.name;
    } else if (zakazka.status !== "NOVA" && zakazka.status !== "PRIDELENA") {
      return {
        ok: false as const,
        chyba: "Rozpracované ani hotové zakázce technika odebrat nejde. Nejdřív vraťte stav.",
      };
    }

    // Nová zakázka se přidělením přepne na Přidělená, zrušením zpět na Nová.
    const status: Stav =
      technikId && zakazka.status === "NOVA"
        ? "PRIDELENA"
        : !technikId && zakazka.status === "PRIDELENA"
          ? "NOVA"
          : zakazka.status;
    const zmeneno = await tx.order.updateMany({
      where: {
        id: zakazkaId,
        deletedAt: null,
        status: zakazka.status,
        technicianId: zakazka.technicianId,
      },
      data: { technicianId: technikId, status },
    });
    if (zmeneno.count !== 1) return { ok: false as const, chyba: SOUBEH };
    await zapisHistorii(tx, {
      userId: kdo.id,
      entity: "zakazka",
      entityId: zakazkaId,
      action: "prideleno",
      detail: jmeno ? `technik ${jmeno}` : "bez technika",
    });
    return { ok: true as const };
  });
}

export async function zmenStav(
  kdo: Prihlaseny,
  zakazkaId: string,
  puvodni: Stav,
  novy: Stav,
): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    await zamkniZakazku(tx, zakazkaId);
    const zakazka = await tx.order.findFirst({
      where: {
        id: zakazkaId,
        deletedAt: null,
        // Technik cizí zakázku nenajde — odpověď je stejná jako u neexistující.
        ...(kdo.role === "TECHNIK" ? { technicianId: kdo.id } : {}),
      },
      select: { status: true, technicianId: true },
    });
    if (!zakazka) return { ok: false as const, chyba: ZAKAZKA_NEEXISTUJE };
    if (zakazka.status !== puvodni) return { ok: false as const, chyba: SOUBEH };
    if (!smiZmenitStav(kdo.role, puvodni, novy)) {
      return { ok: false as const, chyba: "Tuhle změnu stavu udělat nemůžete." };
    }
    if (STAVY_S_TECHNIKEM.includes(novy) && !zakazka.technicianId) {
      return { ok: false as const, chyba: "Nejdřív zakázku přidělte technikovi." };
    }
    if (STAVY_S_PRACI.includes(novy) && !(await maPraci(tx, zakazkaId))) {
      return { ok: false as const, chyba: "Nejdřív zapište do výkazu odvedenou práci." };
    }
    if (novy === "NOVA" && zakazka.technicianId) {
      return {
        ok: false as const,
        chyba: "Nová zakázka nemá technika — nejdřív zrušte přidělení.",
      };
    }
    const zmeneno = await tx.order.updateMany({
      where: { id: zakazkaId, deletedAt: null, status: puvodni },
      data: { status: novy },
    });
    if (zmeneno.count !== 1) return { ok: false as const, chyba: SOUBEH };
    await zapisHistorii(tx, {
      userId: kdo.id,
      entity: "zakazka",
      entityId: zakazkaId,
      action: "stav",
      detail: `${NAZEV_STAVU[puvodni]} → ${NAZEV_STAVU[novy]}`,
    });
    return { ok: true as const };
  });
}
