import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Připojení k databázi (Prisma 7 přes adaptér nad ovladačem `pg`, jako v CRM).
 * Adresa jde jen z prostředí — heslo nikdy do kódu ani do obrazu.
 */

const globalne = globalThis as unknown as { prisma?: PrismaClient };

function ziskejKlienta(): PrismaClient {
  if (globalne.prisma) return globalne.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Chybí proměnná DATABASE_URL — aplikace se nemá kam připojit.");
  }

  const klient = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  // Ve vývoji se moduly načítají znovu po každé změně — bez uložení by
  // přibývala připojení, až by je databáze odmítla. V produkci stačí jedno
  // na proces, uloží se taky.
  globalne.prisma = klient;
  return klient;
}

/**
 * Klient se vytvoří až při prvním dotazu. Při `next build` databáze neběží
 * a DATABASE_URL chybí — vytvoření při importu by shodilo sestavení.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_cil, vlastnost) {
    const instance = ziskejKlienta();
    const hodnota = Reflect.get(instance, vlastnost, instance);
    return typeof hodnota === "function" ? hodnota.bind(instance) : hodnota;
  },
});
