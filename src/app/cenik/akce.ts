"use server";

import { refresh } from "next/cache";

import * as cenik from "@/lib/cenik";
import { vyzadujRoli } from "@/lib/sezeni";
import { idSchema, type Vysledek } from "@/lib/uzivatele";

/*
 * Akce ceníku (krok 4A). Oprávnění (Jakub, 9. 11. 2026): **mění jen
 * Majitel** — Dispečer ceník jen vidí, Technik nic (404). Role je první
 * řádek každé akce. Nepřihlášený jde na přihlášení.
 *
 * Soubor s "use server" smí vyvážet jen asynchronní funkce.
 */

function prvniChyba(chyba: { issues: { message: string }[] }): string {
  return chyba.issues[0]?.message ?? "Zkontrolujte údaje.";
}

export async function zmenSazbu(vstup: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli("MAJITEL");
  const udaje = cenik.sazbaSchema.safeParse(vstup);
  if (!udaje.success) return { ok: false, chyba: prvniChyba(udaje.error) };
  const vysledek = await cenik.zmenSazbu(kdo, udaje.data.sazba);
  if (vysledek.ok) refresh();
  return vysledek;
}

export async function pridejPolozku(vstup: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli("MAJITEL");
  const udaje = cenik.polozkaSchema.safeParse(vstup);
  if (!udaje.success) return { ok: false, chyba: prvniChyba(udaje.error) };
  const vysledek = await cenik.pridejPolozku(kdo, udaje.data);
  if (vysledek.ok) refresh();
  return vysledek;
}

export async function upravPolozku(id: unknown, vstup: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli("MAJITEL");
  const platneId = idSchema.safeParse(id);
  if (!platneId.success) return { ok: false, chyba: "Položka ceníku neexistuje." };
  const udaje = cenik.polozkaSchema.safeParse(vstup);
  if (!udaje.success) return { ok: false, chyba: prvniChyba(udaje.error) };
  const vysledek = await cenik.upravPolozku(kdo, platneId.data, udaje.data);
  if (vysledek.ok) refresh();
  return vysledek;
}

export async function smazPolozku(id: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli("MAJITEL");
  const platneId = idSchema.safeParse(id);
  if (!platneId.success) return { ok: false, chyba: "Položka ceníku neexistuje." };
  const vysledek = await cenik.smazPolozku(kdo, platneId.data);
  if (vysledek.ok) refresh();
  return vysledek;
}
