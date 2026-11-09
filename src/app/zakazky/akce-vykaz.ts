"use server";

import { refresh } from "next/cache";
import type { z } from "zod";

import { vyzadujRoli } from "@/lib/sezeni";
import { idSchema, type Vysledek } from "@/lib/uzivatele";
import * as vykaz from "@/lib/vykaz";

/*
 * Akce výkazu (krok 2C). Oprávnění (Jakub, 8. 11. 2026): zapisují
 * všechny tři role, ale Technik jen u své zakázky, jen své řádky a jen do
 * stavu Hotová; u Vyfakturované nikdo. Role je první řádek každé akce,
 * pravidla hlídá src/lib/vykaz.ts (zakázka přes `viditelneZakazky()`).
 * Nepřihlášený jde na přihlášení.
 *
 * Soubor s "use server" smí vyvážet jen asynchronní funkce.
 */

const ROLE = ["MAJITEL", "DISPECER", "TECHNIK"] as const;

function prvniChyba(chyba: { issues: { message: string }[] }): string {
  return chyba.issues[0]?.message ?? "Zkontrolujte údaje.";
}

/** Společný průběh: role → id → údaje → zápis → obnovení stránky. */
async function proved<T>(
  id: unknown,
  vstup: unknown,
  schema: z.ZodType<T>,
  zapis: (kdo: Awaited<ReturnType<typeof vyzadujRoli>>, id: string, udaje: T) => Promise<Vysledek>,
): Promise<Vysledek> {
  const kdo = await vyzadujRoli(...ROLE);
  const platneId = idSchema.safeParse(id);
  if (!platneId.success) return { ok: false, chyba: "Záznam neexistuje." };
  const udaje = schema.safeParse(vstup);
  if (!udaje.success) return { ok: false, chyba: prvniChyba(udaje.error) };
  const vysledek = await zapis(kdo, platneId.data, udaje.data);
  if (vysledek.ok) refresh();
  return vysledek;
}

export async function pridejPraci(zakazkaId: unknown, vstup: unknown): Promise<Vysledek> {
  return proved(zakazkaId, vstup, vykaz.praceSchema, vykaz.pridejPraci);
}

export async function upravPraci(radekId: unknown, vstup: unknown): Promise<Vysledek> {
  return proved(radekId, vstup, vykaz.praceSchema, vykaz.upravPraci);
}

export async function pridejMaterial(zakazkaId: unknown, vstup: unknown): Promise<Vysledek> {
  return proved(zakazkaId, vstup, vykaz.materialSchema, vykaz.pridejMaterial);
}

export async function upravMaterial(radekId: unknown, vstup: unknown): Promise<Vysledek> {
  return proved(radekId, vstup, vykaz.materialSchema, vykaz.upravMaterial);
}

export async function smazPraci(radekId: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli(...ROLE);
  const id = idSchema.safeParse(radekId);
  if (!id.success) return { ok: false, chyba: "Záznam neexistuje." };
  const vysledek = await vykaz.smazPraci(kdo, id.data);
  if (vysledek.ok) refresh();
  return vysledek;
}

export async function smazMaterial(radekId: unknown): Promise<Vysledek> {
  const kdo = await vyzadujRoli(...ROLE);
  const id = idSchema.safeParse(radekId);
  if (!id.success) return { ok: false, chyba: "Záznam neexistuje." };
  const vysledek = await vykaz.smazMaterial(kdo, id.data);
  if (vysledek.ok) refresh();
  return vysledek;
}
