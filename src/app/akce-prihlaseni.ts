"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

/**
 * Odhlášení: smaže sezení v databázi i cookie (plugin `nextCookies`).
 * Smí kdokoli — nepřihlášeného prostě pošle na přihlášení.
 */
export async function odhlasit() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Sezení už neplatilo — výsledek je stejný.
  }
  redirect("/prihlaseni");
}
