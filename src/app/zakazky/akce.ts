"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { pridelTechnika as pridel, stavSchema, zmenStav as zmen } from "@/lib/prideleni";
import { vyzadujRoli } from "@/lib/sezeni";
import { idSchema, type Vysledek } from "@/lib/uzivatele";
import {
  smazZakazku as smaz,
  upravZakazku as uprav,
  zakazkaSchema,
  zalozZakazku as zaloz,
} from "@/lib/zakazky";

/*
 * Akce zakázek (krok 2A). Oprávnění (Jakub, 8. 11. 2026): zakládá
 * a upravuje Majitel a Dispečer, maže jen Majitel — první řádek každé
 * akce, Technik dostane 404 i při přímém volání.
 *
 * Soubor s "use server" smí vyvážet jen asynchronní funkce.
 */

function prvniChyba(chyba: { issues: { message: string }[] }): string {
  return chyba.issues[0]?.message ?? "Zkontrolujte údaje.";
}

export async function zalozZakazku(vstup: unknown): Promise<Vysledek<{ id: string }>> {
  const kdo = await vyzadujRoli("MAJITEL", "DISPECER");
  const udaje = zakazkaSchema.safeParse(vstup);
  if (!udaje.success) return { ok: false, chyba: prvniChyba(udaje.error) };
  const vysledek = await zaloz(kdo, udaje.data);
  return vysledek.ok ? { ok: true, id: vysledek.id } : vysledek;
}

export async function upravZakazku(id: unknown, vstup: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli("MAJITEL", "DISPECER");
  const zakazkaId = idSchema.safeParse(id);
  if (!zakazkaId.success) return { ok: false, chyba: "Zakázka neexistuje." };
  const udaje = zakazkaSchema.safeParse(vstup);
  if (!udaje.success) return { ok: false, chyba: prvniChyba(udaje.error) };
  const vysledek = await uprav(kdo, zakazkaId.data, udaje.data);
  if (vysledek.ok) refresh();
  return vysledek;
}

export async function smazZakazku(id: unknown): Promise<Vysledek<{ cislo: number }>> {
  const kdo = await vyzadujRoli("MAJITEL");
  const zakazkaId = idSchema.safeParse(id);
  if (!zakazkaId.success) return { ok: false, chyba: "Zakázka neexistuje." };
  return smaz(kdo, zakazkaId.data);
}

/*
 * Přidělení a stavy (krok 2B, Jakub 8. 11. 2026): technika přiděluje
 * Majitel a Dispečer; stav mění i Technik, ale jen u své zakázky a jen
 * dopředu — pravidla hlídá `zmenStav()` v src/lib/prideleni.ts.
 */

export async function pridelTechnika(id: unknown, technikId: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli("MAJITEL", "DISPECER");
  const zakazkaId = idSchema.safeParse(id);
  const technik = idSchema.or(z.literal("")).safeParse(technikId);
  if (!zakazkaId.success || !technik.success) return { ok: false, chyba: "Neplatná volba." };
  const vysledek = await pridel(kdo, zakazkaId.data, technik.data || null);
  if (vysledek.ok) refresh();
  return vysledek;
}

export async function zmenStav(id: unknown, puvodni: unknown, novy: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli("MAJITEL", "DISPECER", "TECHNIK");
  const zakazkaId = idSchema.safeParse(id);
  const z1 = stavSchema.safeParse(puvodni);
  const z2 = stavSchema.safeParse(novy);
  if (!zakazkaId.success || !z1.success || !z2.success)
    return { ok: false, chyba: "Neplatná volba." };
  const vysledek = await zmen(kdo, zakazkaId.data, z1.data, z2.data);
  if (vysledek.ok) refresh();
  return vysledek;
}
