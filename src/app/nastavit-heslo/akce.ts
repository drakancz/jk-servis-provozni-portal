"use server";

import { z } from "zod";

import { hesloSchema, nastavHesloZOdkazu, tokenSchema } from "@/lib/uzivatele";

/*
 * Nastavení hesla z jednorázového odkazu (krok 1C). Oprávnění (Jakub,
 * 8. 11. 2026): **bez přihlášení**, prokazuje se jen tokenem z odkazu
 * (256 bitů, 24 hodin, jednou). Heslo zadává jen sám uživatel.
 */

const vstupSchema = z
  .object({ token: tokenSchema, heslo: hesloSchema, znovu: z.string().max(128) })
  .refine((v) => v.heslo === v.znovu, { message: "Hesla se neshodují.", path: ["znovu"] });

export async function nastavHeslo(
  vstup: unknown,
): Promise<{ ok: true } | { ok: false; chyba: string }> {
  const data = vstupSchema.safeParse(vstup);
  if (!data.success) {
    const problem = data.error.issues.find((i) => i.path[0] !== "token");
    return { ok: false, chyba: problem?.message ?? "Odkaz už neplatí. Požádejte majitele o nový." };
  }
  const ok = await nastavHesloZOdkazu(data.data.token, data.data.heslo);
  return ok ? { ok: true } : { ok: false, chyba: "Odkaz už neplatí. Požádejte majitele o nový." };
}
