import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Historie změn (krok 2A): kdo co založil, změnil nebo smazal. Zapisuje se
 * **ve stejné transakci** jako změna — když se nezapíše historie, nezapíše
 * se ani změna. Ukládají se jen názvy změněných polí, nikdy hodnoty.
 */

export type Entita = "zakaznik" | "zakazka" | "cenik";
export type Akce = "zalozeno" | "upraveno" | "smazano" | "prideleno" | "stav" | "vykaz";

export const NAZEV_AKCE: Record<Akce, string> = {
  zalozeno: "Založeno",
  upraveno: "Upraveno",
  smazano: "Smazáno",
  prideleno: "Přidělení",
  stav: "Stav",
  vykaz: "Výkaz",
};

export async function zapisHistorii(
  tx: Prisma.TransactionClient,
  zaznam: { userId: string; entity: Entita; entityId: string; action: Akce; detail?: string },
) {
  await tx.history.create({ data: { id: randomUUID(), ...zaznam, detail: zaznam.detail ?? null } });
}

/** Posledních 20 záznamů historie k jednomu zákazníkovi nebo zakázce. */
export async function historie(entity: Entita, entityId: string) {
  const zaznamy = await db.history.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      action: true,
      detail: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  return zaznamy.map((z) => ({
    id: z.id,
    akce: NAZEV_AKCE[z.action as Akce] ?? z.action,
    detail: z.detail,
    kdy: z.createdAt,
    kdo: z.user.name,
  }));
}

/** Názvy polí, jejichž hodnota se změnila (pro záznam „Upraveno: …“). */
export function zmenenaPole<T extends Record<string, unknown>>(
  puvodni: T,
  nove: T,
  nazvy: Record<keyof T, string>,
): string[] {
  return (Object.keys(nazvy) as (keyof T)[])
    .filter((klic) => String(puvodni[klic] ?? "") !== String(nove[klic] ?? ""))
    .map((klic) => nazvy[klic]);
}
