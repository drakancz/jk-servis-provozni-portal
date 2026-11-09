"use server";

import { refresh } from "next/cache";

import { vyzadujRoli } from "@/lib/sezeni";
import { idSchema, type Vysledek } from "@/lib/uzivatele";
import {
  smazZakaznika as smaz,
  upravZakaznika as uprav,
  zakaznikSchema,
  zalozZakaznika as zaloz,
} from "@/lib/zakaznici";

/*
 * Akce zákazníků (krok 2A). Oprávnění (Jakub, 8. 11. 2026): zakládá
 * a upravuje Majitel a Dispečer, maže jen Majitel — první řádek každé
 * akce, Technik dostane 404 i při přímém volání.
 *
 * Soubor s "use server" smí vyvážet jen asynchronní funkce.
 */

function prvniChyba(chyba: { issues: { message: string }[] }): string {
  return chyba.issues[0]?.message ?? "Zkontrolujte údaje.";
}

export async function zalozZakaznika(vstup: unknown): Promise<Vysledek<{ id: string }>> {
  const kdo = await vyzadujRoli("MAJITEL", "DISPECER");
  const udaje = zakaznikSchema.safeParse(vstup);
  if (!udaje.success) return { ok: false, chyba: prvniChyba(udaje.error) };
  const { id } = await zaloz(kdo, udaje.data);
  return { ok: true, id };
}

export async function upravZakaznika(id: unknown, vstup: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli("MAJITEL", "DISPECER");
  const zakaznikId = idSchema.safeParse(id);
  if (!zakaznikId.success) return { ok: false, chyba: "Zákazník neexistuje." };
  const udaje = zakaznikSchema.safeParse(vstup);
  if (!udaje.success) return { ok: false, chyba: prvniChyba(udaje.error) };
  const vysledek = await uprav(kdo, zakaznikId.data, udaje.data);
  if (vysledek.ok) refresh();
  return vysledek;
}

export async function smazZakaznika(id: unknown): Promise<Vysledek<{ jmeno: string }>> {
  const kdo = await vyzadujRoli("MAJITEL");
  const zakaznikId = idSchema.safeParse(id);
  if (!zakaznikId.success) return { ok: false, chyba: "Zákazník neexistuje." };
  return smaz(kdo, zakaznikId.data);
}
