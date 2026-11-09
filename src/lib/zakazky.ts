import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { bezDiakritiky, hledaciText } from "@/lib/hledani";
import { zapisHistorii, zmenenaPole } from "@/lib/historie";
import type { Prihlaseny } from "@/lib/sezeni";
import type { Stav } from "@/lib/stavy";
import { idSchema, type Vysledek } from "@/lib/uzivatele";
import { zamkniZakaznika } from "@/lib/zakaznici";

/**
 * Zakázky (krok 2A). Oprávnění (Jakub, 8. 11. 2026):
 * - **vidí, zakládají a upravují Majitel a Dispečer** (všechny zakázky),
 * - **maže jen Majitel**,
 * - **Technik** vidí jen zakázky přidělené jemu (krok 2B, `viditelneZakazky()`),
 *   upravit, zakládat ani mazat je nesmí,
 * - nepřihlášený jde na přihlášení.
 * **Číslo zakázky přiděluje databáze**, v kódu se nevymýšlí.
 * Smazání jen vyplní `deletedAt` — každý dotaz proto `deletedAt: null`.
 */

/**
 * Den `RRRR-MM-DD` nebo prázdno. Tvar se ověří dřív, než se s hodnotou
 * počítá (past zod 4: po nesplněném regexu pokračuje dalšími kontrolami).
 */
const terminSchema = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const den = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(den.getTime()) && den.toISOString().slice(0, 10) === v;
  }, "Zadejte platné datum.")
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

export const zakazkaSchema = z.object({
  zakaznikId: idSchema.or(z.literal("")).refine((v) => v !== "", "Vyberte zákazníka."),
  misto: z.string().trim().min(3, "Zadejte, kam se jede.").max(200, "Místo je příliš dlouhé."),
  popis: z
    .string()
    .trim()
    .min(3, "Popište, co je potřeba udělat.")
    .max(2000, "Popis může mít nejvýš 2000 znaků."),
  termin: terminSchema,
});
export type UdajeZakazky = z.infer<typeof zakazkaSchema>;

const NAZVY_POLI: Record<keyof UdajeZakazky, string> = {
  zakaznikId: "Zákazník",
  misto: "Místo",
  popis: "Popis",
  termin: "Termín",
};

function doDatabaze(u: UdajeZakazky) {
  return {
    customerId: u.zakaznikId,
    place: u.misto,
    description: u.popis,
    dueDate: u.termin,
    search: hledaciText(u.misto, u.popis),
  };
}

/** Termín (jen den) pro zobrazení — uložený jako půlnoc UTC. */
export const DEN = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "UTC",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

/** Termín do pole formuláře (`RRRR-MM-DD`). */
export function denDoFormulare(den: Date | null): string {
  return den ? den.toISOString().slice(0, 10) : "";
}

/**
 * Každé slovo se musí najít v čísle zakázky, místě, popisu nebo
 * u zákazníka (název, IČO, telefon…).
 */
function podminkaHledani(hledany: string) {
  return bezDiakritiky(hledany)
    .split(" ")
    .filter(Boolean)
    .map((slovo) => ({
      OR: [
        { search: { contains: slovo } },
        { customer: { search: { contains: slovo } } },
        ...(/^\d{1,9}$/.test(slovo) ? [{ number: Number(slovo) }] : []),
      ],
    }));
}

/**
 * Které zakázky kdo vidí (krok 2B) — podmínka patří do dotazu, ne do
 * zobrazení. Majitel a Dispečer všechny, Technik jen přidělené jemu.
 */
export function viditelneZakazky(kdo: Prihlaseny): Prisma.OrderWhereInput {
  return kdo.role === "TECHNIK" ? { deletedAt: null, technicianId: kdo.id } : { deletedAt: null };
}

/**
 * Zamkne řádek zakázky do konce transakce (krok 2C) — změna stavu a zápis
 * do výkazu se tak nepotkají (Hotovo bez práce, smazaná poslední práce).
 */
export async function zamkniZakazku(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM zakazky WHERE id = ${id} FOR UPDATE`;
}

/** Podmínka seznamu zakázek — sdílí ji seznam i export (krok 3C). */
export function podminkaSeznamu(
  kdo: Prihlaseny,
  hledany: string,
  stav: Stav | null,
): Prisma.OrderWhereInput {
  return {
    AND: [viditelneZakazky(kdo), ...podminkaHledani(hledany), ...(stav ? [{ status: stav }] : [])],
  };
}

export async function seznamZakazek(kdo: Prihlaseny, hledany: string, stav: Stav | null = null) {
  const zakazky = await db.order.findMany({
    where: podminkaSeznamu(kdo, hledany, stav),
    orderBy: { number: "desc" },
    take: 200,
    select: {
      id: true,
      number: true,
      place: true,
      description: true,
      dueDate: true,
      status: true,
      customer: { select: { name: true } },
      technician: { select: { name: true } },
    },
  });
  return zakazky.map((z) => ({
    id: z.id,
    cislo: z.number,
    misto: z.place,
    popis: z.description,
    termin: z.dueDate,
    stav: z.status as Stav,
    zakaznik: z.customer.name,
    technik: z.technician?.name ?? null,
  }));
}

export async function detailZakazky(kdo: Prihlaseny, id: string) {
  const zakazka = await db.order.findFirst({
    where: { AND: [{ id }, viditelneZakazky(kdo)] },
    select: {
      id: true,
      number: true,
      place: true,
      description: true,
      dueDate: true,
      createdAt: true,
      status: true,
      technician: { select: { id: true, name: true } },
      customer: {
        select: { id: true, name: true, phone: true, email: true, address: true, deletedAt: true },
      },
    },
  });
  if (!zakazka) return null;
  return {
    id: zakazka.id,
    cislo: zakazka.number,
    misto: zakazka.place,
    popis: zakazka.description,
    termin: zakazka.dueDate,
    zalozeno: zakazka.createdAt,
    stav: zakazka.status as Stav,
    technik: zakazka.technician,
    zakaznik: zakazka.customer,
  };
}

const ZAKAZNIK_NEEXISTUJE = "Vybraný zákazník už neexistuje.";

export async function zalozZakazku(
  kdo: Prihlaseny,
  udaje: UdajeZakazky,
): Promise<Vysledek<{ id: string; cislo: number }>> {
  const id = randomUUID();
  return db.$transaction(async (tx) => {
    await zamkniZakaznika(tx, udaje.zakaznikId);
    const zakaznik = await tx.customer.findFirst({
      where: { id: udaje.zakaznikId, deletedAt: null },
      select: { id: true },
    });
    if (!zakaznik) return { ok: false as const, chyba: ZAKAZNIK_NEEXISTUJE };
    const zakazka = await tx.order.create({
      data: { id, ...doDatabaze(udaje) },
      select: { number: true },
    });
    await zapisHistorii(tx, {
      userId: kdo.id,
      entity: "zakazka",
      entityId: id,
      action: "zalozeno",
    });
    return { ok: true as const, id, cislo: zakazka.number };
  });
}

export async function upravZakazku(
  kdo: Prihlaseny,
  id: string,
  udaje: UdajeZakazky,
): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const puvodni = await tx.order.findFirst({
      where: { id, deletedAt: null },
      select: { customerId: true, place: true, description: true, dueDate: true },
    });
    if (!puvodni) return { ok: false as const, chyba: "Zakázka už neexistuje." };
    const zmeny = zmenenaPole(
      {
        zakaznikId: puvodni.customerId,
        misto: puvodni.place,
        popis: puvodni.description,
        termin: denDoFormulare(puvodni.dueDate),
      },
      { ...udaje, termin: denDoFormulare(udaje.termin) },
      NAZVY_POLI,
    );
    if (zmeny.length === 0) return { ok: true as const };
    if (udaje.zakaznikId !== puvodni.customerId) {
      await zamkniZakaznika(tx, udaje.zakaznikId);
      const zakaznik = await tx.customer.findFirst({
        where: { id: udaje.zakaznikId, deletedAt: null },
        select: { id: true },
      });
      if (!zakaznik) return { ok: false as const, chyba: ZAKAZNIK_NEEXISTUJE };
    }
    await tx.order.update({ where: { id }, data: doDatabaze(udaje) });
    await zapisHistorii(tx, {
      userId: kdo.id,
      entity: "zakazka",
      entityId: id,
      action: "upraveno",
      detail: zmeny.join(", "),
    });
    return { ok: true as const };
  });
}

/** Smazání (jen Majitel). Zakázka zmizí ze seznamů, v databázi zůstane. */
export async function smazZakazku(
  kdo: Prihlaseny,
  id: string,
): Promise<Vysledek<{ cislo: number }>> {
  return db.$transaction(async (tx) => {
    const zakazka = await tx.order.findFirst({
      where: { id, deletedAt: null },
      select: { number: true },
    });
    if (!zakazka) return { ok: false as const, chyba: "Zakázka už neexistuje." };
    await tx.order.update({ where: { id }, data: { deletedAt: new Date() } });
    await zapisHistorii(tx, {
      userId: kdo.id,
      entity: "zakazka",
      entityId: id,
      action: "smazano",
    });
    return { ok: true as const, cislo: zakazka.number };
  });
}
