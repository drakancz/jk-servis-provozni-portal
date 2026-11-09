import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { zajistiObnovu } from "@/lib/ukazka-obnova";

export type Prihlaseny = {
  id: string;
  name: string;
  email: string;
  role: "MAJITEL" | "DISPECER" | "TECHNIK";
};

/**
 * Kdo je přihlášený — ověřuje se na serveru proti tabulce sezení
 * (cookie samotná nestačí). Zrušený účet je jako nepřihlášený.
 */
export async function prihlaseny(): Promise<Prihlaseny | null> {
  // Ukázka (krok 5A): první požadavek nového dne vrátí data do výchozího stavu.
  await zajistiObnovu();
  const sezeni = await auth.api.getSession({ headers: await headers() });
  if (!sezeni || sezeni.user.deletedAt) return null;
  const { id, name, email, role } = sezeni.user;
  return { id, name, email, role: role as Prihlaseny["role"] };
}

/**
 * První řádek každé chráněné stránky i serverové akce. Nepřihlášeného
 * pošle na přihlášení.
 */
export async function vyzadujPrihlaseni(): Promise<Prihlaseny> {
  const uzivatel = await prihlaseny();
  if (!uzivatel) redirect("/prihlaseni");
  return uzivatel;
}

/**
 * Jako `vyzadujPrihlaseni()`, navíc s rolí (krok 1C). Přihlášený bez role
 * dostane 404, ne „nemáte oprávnění“ — z odpovědi se nemá dát vyčíst, co
 * v portálu existuje.
 */
export async function vyzadujRoli(...role: Prihlaseny["role"][]): Promise<Prihlaseny> {
  const uzivatel = await vyzadujPrihlaseni();
  if (!role.includes(uzivatel.role)) notFound();
  return uzivatel;
}
