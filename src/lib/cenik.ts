import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { naHalere } from "@/lib/ceny";
import { db } from "@/lib/db";
import { hledaciText } from "@/lib/hledani";
import { zapisHistorii } from "@/lib/historie";
import type { Prihlaseny } from "@/lib/sezeni";
import type { Vysledek } from "@/lib/uzivatele";
import { JEDNOTKY } from "@/lib/vykaz-pravidla";

/**
 * Ceník (krok 4A). Oprávnění (Jakub, 9. 11. 2026):
 * - **vidí Majitel a Dispečer**, **mění jen Majitel** (sazbu i položky),
 * - **Technik ceník ani ceny nevidí** — u materiálu dostane z ceníku jen
 *   názvy a jednotky (`polozkyKVyberu()`),
 * - nepřihlášený jde na přihlášení.
 * Role hlídá akce (`vyzadujRoli`) i stránka. Smazání položky jen vyplní
 * `deletedAt`; zapsané řádky výkazu si cenu nechají (cena ve chvíli zápisu).
 */

const ID_NASTAVENI = "firma";
/** Sazba, kdyby řádek nastavení chyběl (migrace ho zakládá). */
const VYCHOZI_SAZBA = 650;

/**
 * Částka v Kč z pole formuláře: „650“, „650,50“, „1 290“. Tvar se ověří
 * dřív, než se s hodnotou počítá (past zod 4). Výsledek je text pro Prismu
 * s tečkou („650.50“).
 */
export function castkaSchema(povinna: true): z.ZodType<string>;
export function castkaSchema(povinna: false): z.ZodType<string | null>;
export function castkaSchema(povinna: boolean): z.ZodType<string | null> {
  return z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, "").replace(",", "."))
    .refine(
      (v) => (v === "" && !povinna) || (/^\d{1,7}(\.\d{1,2})?$/.test(v) && Number(v) >= 0),
      "Cenu zadejte číslem v Kč (nejvýš 2 desetinná místa).",
    )
    .transform((v) => (v === "" ? null : v));
}

export const sazbaSchema = z.object({
  sazba: castkaSchema(true).refine((v) => Number(v) > 0, "Sazba musí být větší než nula."),
});

export const polozkaSchema = z.object({
  nazev: z
    .string()
    .trim()
    .min(2, "Zadejte název materiálu.")
    .max(120, "Název může mít nejvýš 120 znaků."),
  jednotka: z.enum(JEDNOTKY, "Vyberte jednotku."),
  cena: castkaSchema(true),
});
export type UdajePolozky = z.infer<typeof polozkaSchema>;

type Tx = Prisma.TransactionClient;

/** Aktuální hodinová sazba v haléřích (pro zápis práce). */
export async function aktualniSazba(tx: Tx | typeof db = db): Promise<number> {
  const nastaveni = await tx.setting.findUnique({
    where: { id: ID_NASTAVENI },
    select: { hourlyRate: true },
  });
  return nastaveni ? naHalere(nastaveni.hourlyRate) : VYCHOZI_SAZBA * 100;
}

/** Celý ceník pro obrazovku Ceník (Majitel a Dispečer). */
export async function nactiCenik() {
  const [sazba, polozky] = await Promise.all([
    aktualniSazba(),
    db.priceItem.findMany({
      where: { deletedAt: null },
      orderBy: { search: "asc" },
      select: { id: true, name: true, unit: true, price: true },
    }),
  ]);
  return {
    sazba,
    polozky: polozky.map((p) => ({
      id: p.id,
      nazev: p.name,
      jednotka: p.unit,
      cena: naHalere(p.price),
    })),
  };
}

/**
 * Položky ceníku do výběru u materiálu. Technik dostane jen název
 * a jednotku — cena do jeho prohlížeče nesmí.
 */
export async function polozkyKVyberu(vidiCeny: boolean) {
  const polozky = await db.priceItem.findMany({
    where: { deletedAt: null },
    orderBy: { search: "asc" },
    select: { id: true, name: true, unit: true, price: true },
  });
  return polozky.map((p) => ({
    id: p.id,
    nazev: p.name,
    jednotka: p.unit,
    ...(vidiCeny ? { cena: naHalere(p.price) } : {}),
  }));
}

/** Položka ceníku pro zápis materiálu (smazaná neexistuje). */
export async function polozkaCeniku(tx: Tx, id: string) {
  return tx.priceItem.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, unit: true, price: true },
  });
}

async function historie(
  tx: Tx,
  kdo: Prihlaseny,
  entityId: string,
  akce: "zalozeno" | "upraveno" | "smazano",
  detail: string,
) {
  await zapisHistorii(tx, { userId: kdo.id, entity: "cenik", entityId, action: akce, detail });
}

export async function zmenSazbu(kdo: Prihlaseny, sazba: string): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { id: ID_NASTAVENI },
      update: { hourlyRate: sazba },
      create: { id: ID_NASTAVENI, hourlyRate: sazba },
    });
    await historie(tx, kdo, ID_NASTAVENI, "upraveno", "Hodinová sazba");
    return { ok: true as const };
  });
}

/** Položka se stejným názvem (bez ohledu na velikost písmen a háčky) už v ceníku je? */
async function dvojita(tx: Tx, nazev: string, krome?: string): Promise<boolean> {
  const stejna = await tx.priceItem.findFirst({
    where: {
      search: hledaciText(nazev),
      deletedAt: null,
      ...(krome ? { NOT: { id: krome } } : {}),
    },
    select: { id: true },
  });
  return stejna !== null;
}

const DVOJITA = "Materiál s tímto názvem už v ceníku je.";
const POLOZKA_NEEXISTUJE = "Položka ceníku už neexistuje. Obnovte stránku.";

export async function pridejPolozku(kdo: Prihlaseny, udaje: UdajePolozky): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    if (await dvojita(tx, udaje.nazev)) return { ok: false as const, chyba: DVOJITA };
    const id = randomUUID();
    await tx.priceItem.create({
      data: {
        id,
        name: udaje.nazev,
        unit: udaje.jednotka,
        price: udaje.cena,
        search: hledaciText(udaje.nazev),
      },
    });
    await historie(tx, kdo, id, "zalozeno", "Položka ceníku");
    return { ok: true as const };
  });
}

export async function upravPolozku(
  kdo: Prihlaseny,
  id: string,
  udaje: UdajePolozky,
): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const polozka = await polozkaCeniku(tx, id);
    if (!polozka) return { ok: false as const, chyba: POLOZKA_NEEXISTUJE };
    if (await dvojita(tx, udaje.nazev, id)) return { ok: false as const, chyba: DVOJITA };
    await tx.priceItem.update({
      where: { id },
      data: {
        name: udaje.nazev,
        unit: udaje.jednotka,
        price: udaje.cena,
        search: hledaciText(udaje.nazev),
      },
    });
    await historie(tx, kdo, id, "upraveno", "Položka ceníku");
    return { ok: true as const };
  });
}

export async function smazPolozku(kdo: Prihlaseny, id: string): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const polozka = await polozkaCeniku(tx, id);
    if (!polozka) return { ok: false as const, chyba: POLOZKA_NEEXISTUJE };
    await tx.priceItem.update({ where: { id }, data: { deletedAt: new Date() } });
    await historie(tx, kdo, id, "smazano", "Položka ceníku");
    return { ok: true as const };
  });
}
