import { z } from "zod";

import { cenaZakazkyBezDph } from "@/lib/ceny";
import { db } from "@/lib/db";
import type { Prihlaseny } from "@/lib/sezeni";
import type { Stav } from "@/lib/stavy";
import { dnesVPraze } from "@/lib/vykaz-pravidla";

/**
 * Přehled pro majitele (krok 4B). Oprávnění (Jakub, 9. 11. 2026):
 * - **vidí Majitel a Dispečer** — počty zakázek, vytížení techniků
 *   a týden v kalendáři,
 * - **částky (nevyfakturováno, vyfakturováno) jen Majitel** — Dispečerovi
 *   je server vůbec nespočítá ani nepošle,
 * - **Technik 404**, nepřihlášený jde na přihlášení.
 * Všechny dotazy `deletedAt: null`.
 */

const OTEVRENE: Stav[] = ["NOVA", "PRIDELENA", "V_PRACI"];
const DEN_MS = 24 * 60 * 60 * 1000;

/** Den `RRRR-MM-DD` jako půlnoc UTC (tak se ukládá termín i den práce). */
function den(text: string): Date {
  return new Date(`${text}T00:00:00Z`);
}

function text(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pondělí týdne, do kterého patří daný den. */
export function pondeli(denText: string): string {
  const d = den(denText);
  const posun = (d.getUTCDay() + 6) % 7; // Po = 0 … Ne = 6
  return text(new Date(d.getTime() - posun * DEN_MS));
}

/**
 * Týden z adresy (`?tyden=RRRR-MM-DD`, libovolný den týdne). Rozbitá nebo
 * nesmyslná hodnota obrazovku neshodí — tiše se nahradí tímto týdnem.
 * Tvar se ověří dřív, než se s hodnotou počítá (past zod 4).
 */
export const tydenSchema = z
  .string()
  .trim()
  .refine((v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = den(v);
    return !Number.isNaN(d.getTime()) && text(d) === v && v >= "2000-01-01" && v <= "2100-12-31";
  })
  .transform(pondeli)
  .catch(() => pondeli(dnesVPraze()));

export function posunTydne(pondeliText: string, tydnu: number): string {
  return text(new Date(den(pondeliText).getTime() + tydnu * 7 * DEN_MS));
}

export async function nactiPrehled(kdo: Prihlaseny, pondeliText: string) {
  const penize = kdo.role === "MAJITEL";
  const od = den(pondeliText);
  const doDne = new Date(od.getTime() + 7 * DEN_MS);
  const dnes = den(dnesVPraze());

  const [podleStavu, technici, hodiny, otevrenePodleTechnika, tyden, poTerminu, cenyKFakturaci] =
    await Promise.all([
      db.order.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      db.user.findMany({
        where: { role: "TECHNIK", deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.workEntry.groupBy({
        by: ["userId"],
        where: { deletedAt: null, date: { gte: od, lt: doDne }, order: { deletedAt: null } },
        _sum: { minutes: true },
      }),
      db.order.groupBy({
        by: ["technicianId"],
        where: { deletedAt: null, status: { in: OTEVRENE }, technicianId: { not: null } },
        _count: { _all: true },
      }),
      db.order.findMany({
        where: { deletedAt: null, dueDate: { gte: od, lt: doDne } },
        orderBy: [{ dueDate: "asc" }, { number: "asc" }],
        take: 200,
        select: {
          id: true,
          number: true,
          status: true,
          dueDate: true,
          place: true,
          customer: { select: { name: true } },
          technician: { select: { name: true } },
        },
      }),
      db.order.findMany({
        where: { deletedAt: null, status: { in: OTEVRENE }, dueDate: { lt: dnes } },
        orderBy: [{ dueDate: "asc" }, { number: "asc" }],
        take: 20,
        select: {
          id: true,
          number: true,
          status: true,
          dueDate: true,
          customer: { select: { name: true } },
          technician: { select: { name: true } },
        },
      }),
      // Částky jen pro Majitele — Dispečerovi se nepočítají vůbec.
      penize
        ? db.order.findMany({
            where: { deletedAt: null, status: { in: ["HOTOVA", "VYFAKTUROVANA"] } },
            select: {
              status: true,
              workEntries: {
                where: { deletedAt: null },
                select: { minutes: true, hourlyRate: true },
              },
              materialEntries: {
                where: { deletedAt: null },
                select: { quantity: true, unitPrice: true },
              },
            },
          })
        : Promise.resolve(null),
    ]);

  const pocet = (s: Stav) => podleStavu.find((r) => r.status === s)?._count._all ?? 0;
  const minutPodle = new Map(hodiny.map((h) => [h.userId, h._sum.minutes ?? 0]));
  const otevrenychPodle = new Map(
    otevrenePodleTechnika.map((o) => [o.technicianId, o._count._all]),
  );

  const castky = cenyKFakturaci
    ? cenyKFakturaci.reduce(
        (s, z) => {
          const cena = cenaZakazkyBezDph(z.workEntries, z.materialEntries);
          if (z.status === "HOTOVA") s.nevyfakturovano += cena;
          else s.vyfakturovano += cena;
          return s;
        },
        { nevyfakturovano: 0, vyfakturovano: 0 },
      )
    : null;

  const zakazka = (z: (typeof tyden)[number] | (typeof poTerminu)[number]) => ({
    id: z.id,
    cislo: z.number,
    stav: z.status as Stav,
    termin: z.dueDate ? text(z.dueDate) : null,
    zakaznik: z.customer.name,
    technik: z.technician?.name ?? null,
  });

  const dny = Array.from({ length: 7 }, (_, i) => {
    const d = text(new Date(od.getTime() + i * DEN_MS));
    return {
      den: d,
      dnes: d === text(dnes),
      zakazky: tyden.filter((z) => z.dueDate && text(z.dueDate) === d).map(zakazka),
    };
  });

  return {
    pocty: {
      nove: pocet("NOVA"),
      prideleno: pocet("PRIDELENA"),
      vPraci: pocet("V_PRACI"),
      hotove: pocet("HOTOVA"),
      vyfakturovane: pocet("VYFAKTUROVANA"),
    },
    castky,
    technici: technici.map((t) => ({
      id: t.id,
      jmeno: t.name,
      minut: minutPodle.get(t.id) ?? 0,
      otevrenych: otevrenychPodle.get(t.id) ?? 0,
    })),
    dny,
    poTerminu: poTerminu.map(zakazka),
  };
}
