import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hledaciText, bezDiakritiky } from "@/lib/hledani";
import { zapisHistorii, zmenenaPole } from "@/lib/historie";
import type { Prihlaseny } from "@/lib/sezeni";
import type { Vysledek } from "@/lib/uzivatele";

/**
 * Zákazníci (krok 2A). Oprávnění (Jakub, 8. 11. 2026):
 * - **vidí, zakládají a upravují Majitel a Dispečer**,
 * - **maže jen Majitel**, a jen zákazníka bez zakázek,
 * - **Technik** seznam ani kartu nemá (404) — zákazníka uvidí jen
 *   u zakázky, která mu je přidělená (krok 2B),
 * - nepřihlášený jde na přihlášení.
 * Kontrola role je první řádek každé stránky a akce; tady se předpokládá.
 * Smazání jen vyplní `deletedAt` — každý dotaz proto `deletedAt: null`.
 */

/** Nepovinný text: prázdný řetězec se uloží jako null. */
function nepovinne(max: number, zprava: string) {
  return z
    .string()
    .trim()
    .max(max, zprava)
    .transform((v) => v || null);
}

export const zakaznikSchema = z.object({
  jmeno: z
    .string()
    .trim()
    .min(2, "Zadejte název firmy nebo jméno.")
    .max(150, "Název je příliš dlouhý."),
  ico: z
    .string()
    .trim()
    .regex(/^(\d{8})?$/, "IČO má 8 číslic.")
    .transform((v) => v || null),
  telefon: z
    .string()
    .trim()
    .max(30, "Telefon je příliš dlouhý.")
    .regex(/^[0-9+()\s-]*$/, "Telefon smí obsahovat jen číslice, mezery a znaky + ( ) -.")
    .transform((v) => v || null),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "E-mail je příliš dlouhý.")
    .refine((v) => v === "" || z.email().safeParse(v).success, "Zadejte platný e-mail.")
    .transform((v) => v || null),
  adresa: nepovinne(200, "Adresa je příliš dlouhá."),
  poznamka: nepovinne(1000, "Poznámka může mít nejvýš 1000 znaků."),
});
export type UdajeZakaznika = z.infer<typeof zakaznikSchema>;

const NAZVY_POLI: Record<keyof UdajeZakaznika, string> = {
  jmeno: "Název",
  ico: "IČO",
  telefon: "Telefon",
  email: "E-mail",
  adresa: "Adresa",
  poznamka: "Poznámka",
};

function doDatabaze(u: UdajeZakaznika) {
  return {
    name: u.jmeno,
    ico: u.ico,
    phone: u.telefon,
    email: u.email,
    address: u.adresa,
    note: u.poznamka,
    search: hledaciText(u.jmeno, u.ico, u.telefon, u.email, u.adresa),
  };
}

function zDatabaze(z: {
  name: string;
  ico: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
}): UdajeZakaznika {
  return {
    jmeno: z.name,
    ico: z.ico,
    telefon: z.phone,
    email: z.email,
    adresa: z.address,
    poznamka: z.note,
  };
}

/**
 * Zamkne řádek zákazníka do konce transakce. Volá ho smazání zákazníka
 * i založení zakázky — díky tomu se nepotkají (smazaný zákazník
 * s novou zakázkou).
 */
export async function zamkniZakaznika(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM zakaznici WHERE id = ${id} FOR UPDATE`;
}

/** Každé slovo hledaného výrazu se musí najít (v libovolném pořadí). */
function podminkaHledani(hledany: string) {
  return bezDiakritiky(hledany)
    .split(" ")
    .filter(Boolean)
    .map((slovo) => ({ search: { contains: slovo } }));
}

export async function seznamZakazniku(hledany: string) {
  const zakaznici = await db.customer.findMany({
    where: { deletedAt: null, AND: podminkaHledani(hledany) },
    orderBy: { name: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      ico: true,
      phone: true,
      address: true,
      _count: { select: { orders: { where: { deletedAt: null } } } },
    },
  });
  return zakaznici.map((z) => ({
    id: z.id,
    jmeno: z.name,
    ico: z.ico,
    telefon: z.phone,
    adresa: z.address,
    zakazek: z._count.orders,
  }));
}

/** Zákazníci do výběru u zakázky. */
export async function vyberZakazniku() {
  return db.customer.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, address: true },
  });
}

export async function detailZakaznika(id: string) {
  const zakaznik = await db.customer.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      ico: true,
      phone: true,
      email: true,
      address: true,
      note: true,
      createdAt: true,
      orders: {
        where: { deletedAt: null },
        orderBy: { number: "desc" },
        select: { id: true, number: true, place: true, description: true, dueDate: true },
      },
    },
  });
  if (!zakaznik) return null;
  return { id: zakaznik.id, ...zDatabaze(zakaznik), zakazky: zakaznik.orders };
}

export async function zalozZakaznika(
  kdo: Prihlaseny,
  udaje: UdajeZakaznika,
): Promise<{ id: string }> {
  const id = randomUUID();
  await db.$transaction(async (tx) => {
    await tx.customer.create({ data: { id, ...doDatabaze(udaje) } });
    await zapisHistorii(tx, {
      userId: kdo.id,
      entity: "zakaznik",
      entityId: id,
      action: "zalozeno",
    });
  });
  return { id };
}

export async function upravZakaznika(
  kdo: Prihlaseny,
  id: string,
  udaje: UdajeZakaznika,
): Promise<Vysledek> {
  const puvodni = await db.customer.findFirst({
    where: { id, deletedAt: null },
    select: { name: true, ico: true, phone: true, email: true, address: true, note: true },
  });
  if (!puvodni) return { ok: false, chyba: "Zákazník už neexistuje." };
  const zmeny = zmenenaPole(zDatabaze(puvodni), udaje, NAZVY_POLI);
  if (zmeny.length === 0) return { ok: true };
  await db.$transaction(async (tx) => {
    const zmeneno = await tx.customer.updateMany({
      where: { id, deletedAt: null },
      data: doDatabaze(udaje),
    });
    if (zmeneno.count !== 1) throw new Error("Zákazník zmizel během úpravy.");
    await zapisHistorii(tx, {
      userId: kdo.id,
      entity: "zakaznik",
      entityId: id,
      action: "upraveno",
      detail: zmeny.join(", "),
    });
  });
  return { ok: true };
}

/**
 * Smazání (jen Majitel). Zákazník se zakázkami smazat nejde — z historie
 * by zmizelo, pro koho se pracovalo. Podmínka i zápis jsou v transakci,
 * takže souběžně založená zakázka smazání zastaví.
 */
export async function smazZakaznika(
  kdo: Prihlaseny,
  id: string,
): Promise<Vysledek<{ jmeno: string }>> {
  return db.$transaction(async (tx) => {
    await zamkniZakaznika(tx, id);
    const zakaznik = await tx.customer.findFirst({
      where: { id, deletedAt: null },
      select: { name: true, _count: { select: { orders: { where: { deletedAt: null } } } } },
    });
    if (!zakaznik) return { ok: false as const, chyba: "Zákazník už neexistuje." };
    if (zakaznik._count.orders > 0) {
      return {
        ok: false as const,
        chyba: "Zákazník má zakázky, proto smazat nejde. Nejdřív smažte jeho zakázky.",
      };
    }
    await tx.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    await zapisHistorii(tx, {
      userId: kdo.id,
      entity: "zakaznik",
      entityId: id,
      action: "smazano",
    });
    return { ok: true as const, jmeno: zakaznik.name };
  });
}
