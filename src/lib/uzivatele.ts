import { createHash, randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import { db } from "@/lib/db";
import { ROLE, type Role } from "@/lib/role";
import type { Prihlaseny } from "@/lib/sezeni";
import { CHRANENY_UCET, jeChranenyUcet } from "@/lib/ukazka";

/**
 * Správa uživatelů (krok 1C, Jakub 8. 11. 2026).
 *
 * - **Účty zakládá, mění a ruší jen Majitel** (Dispečer ani Technik ne).
 *   Kontrola role je v každé akci (`vyzadujRoli("MAJITEL")`), tady se
 *   předpokládá, že proběhla.
 * - **Heslo si nastaví každý sám** přes jednorázový odkaz, který Majitel
 *   předá (portál neposílá e-maily). Odkaz platí 24 hodin a jen jednou;
 *   v databázi je jen otisk tokenu. Majitel heslo nikdy nezná.
 * - **Zrušení účtu** okamžitě odhlásí a přihlásit se už nejde; záznam
 *   zůstává kvůli historii zakázek (`deletedAt`).
 * - **Pojistka:** Majitel nezruší sám sebe a nezmění vlastní roli, takže
 *   poslední Majitel nikdy nezmizí. Navíc se to hlídá i počtem.
 */

export { NAZEV_ROLE, ROLE, type Role } from "@/lib/role";

const PLATNOST_ODKAZU_MS = 24 * 60 * 60 * 1000;

export const idSchema = z.string().trim().min(1).max(64);
export const roleSchema = z.enum(ROLE);
export const novyUzivatelSchema = z.object({
  jmeno: z.string().trim().min(2, "Zadejte jméno a příjmení.").max(100, "Jméno je příliš dlouhé."),
  email: z.email("Zadejte platný e-mail.").trim().toLowerCase().max(254),
  role: roleSchema,
});
export const tokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{43}$/);
export const hesloSchema = z
  .string()
  .min(12, "Heslo musí mít aspoň 12 znaků.")
  .max(128, "Heslo může mít nejvýš 128 znaků.");

export type Vysledek<T = object> = ({ ok: true } & T) | { ok: false; chyba: string };

function otisk(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Nový jednorázový odkaz; předchozí nepoužité odkazy uživatele zruší. */
export async function vytvorOdkaz(userId: string): Promise<{ token: string; platiDo: Date }> {
  const token = randomBytes(32).toString("base64url");
  const platiDo = new Date(Date.now() + PLATNOST_ODKAZU_MS);
  await db.$transaction([
    db.passwordLink.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordLink.create({
      data: { id: randomUUID(), userId, tokenHash: otisk(token), expiresAt: platiDo },
    }),
  ]);
  return { token, platiDo };
}

/** Celá adresa odkazu. Adresa portálu je jen z prostředí, ne z požadavku. */
export function adresaOdkazu(token: string): string {
  const zaklad = process.env.BETTER_AUTH_URL ?? "http://localhost:3200";
  return `${zaklad.replace(/\/$/, "")}/nastavit-heslo?t=${token}`;
}

/** Platný odkaz → komu patří. Použitý, propadlý nebo u zrušeného účtu = null. */
export async function platnyOdkaz(token: string) {
  const overeny = tokenSchema.safeParse(token);
  if (!overeny.success) return null;
  const odkaz = await db.passwordLink.findUnique({
    where: { tokenHash: otisk(overeny.data) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { id: true, name: true, email: true, deletedAt: true } },
    },
  });
  if (!odkaz || odkaz.usedAt || odkaz.expiresAt <= new Date() || odkaz.user.deletedAt) return null;
  // Ukázka (krok 5A): heslo ukázkového účtu nejde přepsat ani starým odkazem.
  if (jeChranenyUcet(odkaz.user.email)) return null;
  return odkaz;
}

/**
 * Nastaví heslo z odkazu. Odkaz se spotřebuje podmíněným zápisem, takže ani
 * dvě souběžná odeslání ho nepoužijí dvakrát. Staré přihlášení se zruší.
 */
export async function nastavHesloZOdkazu(token: string, heslo: string): Promise<boolean> {
  const odkaz = await platnyOdkaz(token);
  if (!odkaz) return false;
  const otiskHesla = await hashPassword(heslo);
  return db.$transaction(async (tx) => {
    const spotrebovano = await tx.passwordLink.updateMany({
      where: { id: odkaz.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (spotrebovano.count !== 1) return false;
    const userId = odkaz.user.id;
    await tx.account.deleteMany({ where: { userId, providerId: "credential" } });
    await tx.account.create({
      data: {
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: otiskHesla,
      },
    });
    await tx.session.deleteMany({ where: { userId } });
    await tx.passwordLink.deleteMany({ where: { userId, usedAt: null } });
    return true;
  });
}

export async function zalozUzivatele(udaje: z.infer<typeof novyUzivatelSchema>) {
  const existuje = await db.user.findUnique({
    where: { email: udaje.email },
    select: { id: true },
  });
  if (existuje) return null;
  return db.user.create({
    data: {
      id: randomUUID(),
      name: udaje.jmeno,
      email: udaje.email,
      role: udaje.role,
      emailVerified: true,
    },
    select: { id: true, name: true },
  });
}

async function aktivnichMajitelu(): Promise<number> {
  return db.user.count({ where: { role: "MAJITEL", deletedAt: null } });
}

export async function zmenRoli(kdo: Prihlaseny, userId: string, role: Role): Promise<Vysledek> {
  if (userId === kdo.id) return { ok: false, chyba: "Vlastní roli změnit nejde." };
  const uzivatel = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { role: true, email: true },
  });
  if (!uzivatel) return { ok: false, chyba: "Účet už neexistuje." };
  if (jeChranenyUcet(uzivatel.email)) return { ok: false, chyba: CHRANENY_UCET };
  if (uzivatel.role === "MAJITEL" && role !== "MAJITEL" && (await aktivnichMajitelu()) <= 1) {
    return { ok: false, chyba: "Portál musí mít aspoň jednoho majitele." };
  }
  await db.user.update({ where: { id: userId }, data: { role } });
  return { ok: true };
}

export async function zrusUcet(
  kdo: Prihlaseny,
  userId: string,
): Promise<Vysledek<{ jmeno: string }>> {
  if (userId === kdo.id) return { ok: false, chyba: "Vlastní účet zrušit nejde." };
  const uzivatel = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { name: true, role: true, email: true },
  });
  if (!uzivatel) return { ok: false, chyba: "Účet už neexistuje." };
  if (jeChranenyUcet(uzivatel.email)) return { ok: false, chyba: CHRANENY_UCET };
  if (uzivatel.role === "MAJITEL" && (await aktivnichMajitelu()) <= 1) {
    return { ok: false, chyba: "Portál musí mít aspoň jednoho majitele." };
  }
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }),
    // Okamžité odhlášení na všech zařízeních a konec nepoužitých odkazů.
    db.session.deleteMany({ where: { userId } }),
    db.passwordLink.deleteMany({ where: { userId, usedAt: null } }),
  ]);
  return { ok: true, jmeno: uzivatel.name };
}

/** Seznam pro obrazovku Uživatelé. Bez otisků hesel a tokenů. */
export async function seznamUzivatelu() {
  const uzivatele = await db.user.findMany({
    orderBy: [{ deletedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      deletedAt: true,
      accounts: { where: { providerId: "credential" }, select: { id: true } },
      passwordLinks: {
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        select: { expiresAt: true },
      },
    },
  });
  return uzivatele.map((u) => ({
    id: u.id,
    jmeno: u.name,
    email: u.email,
    role: u.role as Role,
    zruseno: u.deletedAt,
    maHeslo: u.accounts.length > 0,
    odkazPlatiDo: u.passwordLinks[0]?.expiresAt ?? null,
  }));
}
