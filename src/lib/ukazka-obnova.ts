import { hashPassword } from "better-auth/crypto";

import { db } from "@/lib/db";
import { hledaciText } from "@/lib/hledani";
import { HESLO_UKAZKY, jeUkazka, UKAZKOVE_UCTY } from "@/lib/ukazka";
import {
  CENIK_UKAZKY,
  DALSI_TECHNICI,
  SAZBA_UKAZKY,
  ZAKAZKY_UKAZKY,
  ZAKAZNICI_UKAZKY,
} from "@/lib/ukazka-data";
import { dnesVPraze } from "@/lib/vykaz-pravidla";

/**
 * Obnova ukázky (krok 5A, Jakub 9. 11. 2026): **při prvním otevření nového
 * pražského dne** se data vrátí do výchozího stavu. Volá ji `prihlaseny()`
 * (každá stránka i akce) a přihlašovací stránka — jen s `UKAZKA=1`.
 *
 * - Den poslední obnovy je v `nastaveni.demoRestoredDay`; běžný požadavek
 *   stojí jeden malý dotaz.
 * - Souběžné požadavky se nepotkají: obnova drží zámek
 *   (`pg_advisory_xact_lock`) a den kontroluje znovu až pod ním.
 * - Smaže zakázky, zákazníky, výkaz, ceník, historii a odkazy na heslo;
 *   uživatelé kromě ukázkových zmizí. Ukázkové účty dostanou zpátky roli
 *   a veřejné heslo; jejich přihlášení (sezení) zůstanou.
 */

const ZAMEK = 52_001;

/** Den `RRRR-MM-DD` posunutý o `dni` jako půlnoc UTC (tak se ukládají dny). */
function den(dnes: string, dni: number): Date {
  const d = new Date(`${dnes}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d;
}

export async function zajistiObnovu(): Promise<void> {
  if (!jeUkazka()) return;
  const dnes = dnesVPraze();
  const nastaveni = await db.setting.findUnique({
    where: { id: "firma" },
    select: { demoRestoredDay: true },
  });
  if (nastaveni?.demoRestoredDay === dnes) return;
  await obnovUkazku(dnes);
}

/** Vrátí ukázku do výchozího stavu (nejvýš jednou za den). */
export async function obnovUkazku(dnes: string = dnesVPraze()): Promise<void> {
  if (!jeUkazka()) throw new Error("Obnova ukázky běží jen s UKAZKA=1.");
  // Otisk hesla mimo transakci — scrypt chvíli trvá a zámek má být krátký.
  const otisk = await hashPassword(HESLO_UKAZKY);

  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ZAMEK})`;
      const nastaveni = await tx.setting.findUnique({
        where: { id: "firma" },
        select: { demoRestoredDay: true },
      });
      if (nastaveni?.demoRestoredDay === dnes) return;

      await tx.$executeRawUnsafe(
        `TRUNCATE historie, vykaz_prace, vykaz_material, zakazky, zakaznici, cenik_material, odkazy_hesla RESTART IDENTITY CASCADE`,
      );

      // Uživatelé: zůstanou jen ukázkoví (podle e-mailu), ostatní zmizí
      // i se sezeními a hesly (cascade).
      const ucty = [
        ...UKAZKOVE_UCTY.map((u) => ({ ...u, prihlaseni: true })),
        ...DALSI_TECHNICI.map((u) => ({ ...u, role: "TECHNIK" as const, prihlaseni: false })),
      ];
      await tx.user.deleteMany({ where: { email: { notIn: ucty.map((u) => u.email) } } });
      const idPodle = new Map<string, string>();
      for (const u of ucty) {
        const ulozeny = await tx.user.upsert({
          where: { email: u.email },
          update: { name: u.name, role: u.role, deletedAt: null },
          create: { id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: true },
          select: { id: true },
        });
        idPodle.set(u.id, ulozeny.id);
        await tx.account.deleteMany({ where: { userId: ulozeny.id, providerId: "credential" } });
        if (u.prihlaseni) {
          await tx.account.create({
            data: {
              id: `${u.id}-heslo`,
              accountId: ulozeny.id,
              providerId: "credential",
              userId: ulozeny.id,
              password: otisk,
            },
          });
        } else {
          // Technik bez přihlášení — kdyby mu návštěvník nastavil heslo.
          await tx.session.deleteMany({ where: { userId: ulozeny.id } });
        }
      }
      const technik = (kdo: string | null) =>
        kdo === null ? null : (idPodle.get(`ukazka-${kdo}`) ?? null);
      const dispecer = idPodle.get("ukazka-dispecer")!;

      await tx.setting.upsert({
        where: { id: "firma" },
        update: { hourlyRate: SAZBA_UKAZKY, demoRestoredDay: dnes },
        create: { id: "firma", hourlyRate: SAZBA_UKAZKY, demoRestoredDay: dnes },
      });

      await tx.priceItem.createMany({
        data: CENIK_UKAZKY.map((p) => ({ ...p, search: hledaciText(p.name) })),
      });
      await tx.customer.createMany({
        data: ZAKAZNICI_UKAZKY.map((z) => ({
          ...z,
          search: hledaciText(z.name, z.ico, z.phone, z.address),
        })),
      });

      for (const [i, z] of ZAKAZKY_UKAZKY.entries()) {
        const zakaznik = ZAKAZNICI_UKAZKY[z.zakaznik - 1];
        const misto = z.misto ?? zakaznik.address;
        const id = `ukazka-zakazka-${i + 1}`;
        await tx.order.create({
          data: {
            id,
            customerId: zakaznik.id,
            place: misto,
            description: z.popis,
            dueDate: z.termin === null ? null : den(dnes, z.termin),
            status: z.stav,
            technicianId: technik(z.technik),
            search: hledaciText(misto, z.popis),
          },
        });
        await tx.history.create({
          data: {
            id: `${id}-zalozeno`,
            userId: dispecer,
            entity: "zakazka",
            entityId: id,
            action: "zalozeno",
          },
        });
        const zapsal = technik(z.technik) ?? dispecer;
        for (const [j, p] of (z.prace ?? []).entries()) {
          await tx.workEntry.create({
            data: {
              id: `${id}-prace-${j + 1}`,
              orderId: id,
              userId: zapsal,
              date: den(dnes, p.den),
              minutes: p.minut,
              note: p.co,
              hourlyRate: SAZBA_UKAZKY,
            },
          });
        }
        for (const [j, m] of (z.material ?? []).entries()) {
          const polozka = CENIK_UKAZKY[m.polozka];
          await tx.materialEntry.create({
            data: {
              id: `${id}-material-${j + 1}`,
              orderId: id,
              userId: zapsal,
              name: polozka.name,
              unit: polozka.unit,
              quantity: m.mnozstvi,
              priceItemId: polozka.id,
              unitPrice: polozka.price,
            },
          });
        }
      }
    },
    { timeout: 60_000, maxWait: 60_000 },
  );
}
