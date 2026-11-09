import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hledaciText } from "@/lib/hledani";
import type { Tabulka } from "@/lib/import-excel";
import type { Prirazeni } from "@/lib/import-pole";
import { zkontrolujRadky, type Kontext, type VysledekKontroly } from "@/lib/import-kontrola";
import type { Prihlaseny } from "@/lib/sezeni";
import type { Vysledek } from "@/lib/uzivatele";

/**
 * Uložení importu (krok 3B). Oprávnění hlídá akce (Majitel a Dispečer,
 * Jakub 8. 11. 2026). Pravidla řádků jsou v `src/lib/import-kontrola.ts`;
 * tady se jen načtou zákazníci a technici a bezchybné řádky se zapíšou
 * **v jedné transakci** — buď všechny, nebo žádný.
 */

const DETAIL = "Import z Excelu";

async function nactiKontext(tx: Prisma.TransactionClient = db): Promise<Kontext> {
  const [zakaznici, technici] = await Promise.all([
    tx.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    tx.user.findMany({
      where: { role: "TECHNIK", deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);
  return { zakaznici, technici };
}

/** Kontrola bez zápisu — co by se uložilo a co ne. */
export async function zkontrolujImport(
  tabulka: Tabulka,
  prirazeni: Prirazeni,
): Promise<VysledekKontroly> {
  return zkontrolujRadky(tabulka, prirazeni, await nactiKontext());
}

export async function ulozImport(
  kdo: Prihlaseny,
  tabulka: Tabulka,
  prirazeni: Prirazeni,
): Promise<Vysledek<{ zakazek: number; zakazniku: number; preskoceno: number }>> {
  return db.$transaction(
    async (tx) => {
      // Kontrola znovu, nad aktuálními daty — mezitím mohl někdo smazat
      // zákazníka nebo technika.
      const kontrola = zkontrolujRadky(tabulka, prirazeni, await nactiKontext(tx));
      const radky = kontrola.pripravene;
      if (radky.length === 0) {
        return { ok: false as const, chyba: "V tabulce není žádný řádek bez chyb." };
      }

      // Spárovaní zákazníci se zamknou (jako při založení zakázky), ať je
      // nikdo nesmaže dřív, než transakce skončí.
      const existujici = [
        ...new Set(radky.flatMap((r) => (r.zakaznik.druh === "existujici" ? [r.zakaznik.id] : []))),
      ];
      if (existujici.length > 0) {
        const zamceni = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM zakaznici
          WHERE id = ANY(${existujici}::text[]) AND "deletedAt" IS NULL
          FOR UPDATE`;
        if (zamceni.length !== existujici.length) {
          return {
            ok: false as const,
            chyba: "Zákazníci se mezitím změnili. Zkontrolujte řádky znovu.",
          };
        }
      }
      if (radky.some((r) => r.technikId)) {
        const technici = [...new Set(radky.flatMap((r) => (r.technikId ? [r.technikId] : [])))];
        const zamceni = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM users
          WHERE id = ANY(${technici}::text[]) AND role = 'TECHNIK' AND "deletedAt" IS NULL
          FOR UPDATE`;
        if (zamceni.length !== technici.length) {
          return {
            ok: false as const,
            chyba: "Technici se mezitím změnili. Zkontrolujte řádky znovu.",
          };
        }
      }

      // Noví zákazníci: stejný název na víc řádcích = jeden zákazník.
      const noviPodleKlice = new Map<string, string>();
      const noviZakaznici: Prisma.CustomerCreateManyInput[] = [];
      for (const r of radky) {
        if (r.zakaznik.druh !== "novy" || noviPodleKlice.has(r.zakaznik.klic)) continue;
        const id = randomUUID();
        noviPodleKlice.set(r.zakaznik.klic, id);
        const { jmeno, telefon, email } = r.zakaznik;
        noviZakaznici.push({
          id,
          name: jmeno,
          phone: telefon,
          email,
          search: hledaciText(jmeno, telefon, email),
        });
      }
      if (noviZakaznici.length > 0) await tx.customer.createMany({ data: noviZakaznici });

      // Zakázky v pořadí řádků; číslo přidělí databáze.
      const zakazky: Prisma.OrderCreateManyInput[] = radky.map((r) => ({
        id: randomUUID(),
        customerId:
          r.zakaznik.druh === "existujici" ? r.zakaznik.id : noviPodleKlice.get(r.zakaznik.klic)!,
        place: r.misto,
        description: r.popis,
        dueDate: r.termin,
        status: r.stav,
        technicianId: r.technikId,
        search: hledaciText(r.misto, r.popis),
      }));
      await tx.order.createMany({ data: zakazky });

      await tx.history.createMany({
        data: [
          ...noviZakaznici.map((z) => ({
            id: randomUUID(),
            userId: kdo.id,
            entity: "zakaznik",
            entityId: z.id,
            action: "zalozeno",
            detail: DETAIL,
          })),
          ...zakazky.map((z) => ({
            id: randomUUID(),
            userId: kdo.id,
            entity: "zakazka",
            entityId: z.id!,
            action: "zalozeno",
            detail: DETAIL,
          })),
        ],
      });

      return {
        ok: true as const,
        zakazek: zakazky.length,
        zakazniku: noviZakaznici.length,
        preskoceno: kontrola.souhrn.sChybou,
      };
    },
    { timeout: 30_000 },
  );
}
