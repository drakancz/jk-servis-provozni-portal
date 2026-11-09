"use server";

import { refresh } from "next/cache";

import { db } from "@/lib/db";
import { vyzadujRoli } from "@/lib/sezeni";
import { CHRANENY_UCET, jeChranenyUcet } from "@/lib/ukazka";
import {
  adresaOdkazu,
  idSchema,
  novyUzivatelSchema,
  roleSchema,
  vytvorOdkaz,
  zalozUzivatele as zaloz,
  zmenRoli as zmen,
  zrusUcet as zrus,
  type Vysledek,
} from "@/lib/uzivatele";

/*
 * Akce obrazovky Uživatelé (krok 1C). Oprávnění (Jakub, 8. 11. 2026):
 * **jen Majitel** — první řádek každé akce, Dispečer i Technik dostanou
 * 404 i při přímém volání. Nepřihlášený jde na přihlášení.
 *
 * Soubor s "use server" smí vyvážet jen asynchronní funkce (jako v CRM).
 */

type Odkaz = { odkaz: string; platiDo: string };

export async function zalozUzivatele(vstup: unknown): Promise<Vysledek<Odkaz & { jmeno: string }>> {
  await vyzadujRoli("MAJITEL");
  const udaje = novyUzivatelSchema.safeParse(vstup);
  if (!udaje.success)
    return { ok: false, chyba: udaje.error.issues[0]?.message ?? "Zkontrolujte údaje." };
  const uzivatel = await zaloz(udaje.data);
  if (!uzivatel)
    return { ok: false, chyba: "Účet s tímto e-mailem už existuje (i mezi zrušenými)." };
  const { token, platiDo } = await vytvorOdkaz(uzivatel.id);
  refresh();
  return {
    ok: true,
    jmeno: uzivatel.name,
    odkaz: adresaOdkazu(token),
    platiDo: platiDo.toISOString(),
  };
}

export async function novyOdkaz(userId: unknown): Promise<Vysledek<Odkaz>> {
  await vyzadujRoli("MAJITEL");
  const id = idSchema.safeParse(userId);
  if (!id.success) return { ok: false, chyba: "Účet neexistuje." };
  const existuje = await db.user.findFirst({
    where: { id: id.data, deletedAt: null },
    select: { id: true, email: true },
  });
  if (!existuje) return { ok: false, chyba: "Účet už neexistuje." };
  if (jeChranenyUcet(existuje.email)) return { ok: false, chyba: CHRANENY_UCET };
  const { token, platiDo } = await vytvorOdkaz(id.data);
  refresh();
  return { ok: true, odkaz: adresaOdkazu(token), platiDo: platiDo.toISOString() };
}

export async function zmenRoli(userId: unknown, role: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli("MAJITEL");
  const id = idSchema.safeParse(userId);
  const novaRole = roleSchema.safeParse(role);
  if (!id.success || !novaRole.success) return { ok: false, chyba: "Neplatná volba." };
  const vysledek = await zmen(kdo, id.data, novaRole.data);
  if (vysledek.ok) refresh();
  return vysledek;
}

export async function zrusUcet(userId: unknown): Promise<Vysledek<{ jmeno: string }>> {
  const kdo = await vyzadujRoli("MAJITEL");
  const id = idSchema.safeParse(userId);
  if (!id.success) return { ok: false, chyba: "Účet neexistuje." };
  const vysledek = await zrus(kdo, id.data);
  if (vysledek.ok) refresh();
  return vysledek;
}
