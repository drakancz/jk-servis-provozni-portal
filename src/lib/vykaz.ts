import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { aktualniSazba, castkaSchema, polozkaCeniku } from "@/lib/cenik";
import { cenaMaterialu, cenaPrace, dph, naHalere, vidiCeny } from "@/lib/ceny";
import { db } from "@/lib/db";
import { zapisHistorii } from "@/lib/historie";
import type { Prihlaseny } from "@/lib/sezeni";
import type { Stav } from "@/lib/stavy";
import { idSchema, type Vysledek } from "@/lib/uzivatele";
import {
  dnesVPraze,
  JEDNOTKY,
  smiMenitRadek,
  smiPsatDoVykazu,
  STAVY_S_PRACI,
} from "@/lib/vykaz-pravidla";
import { viditelneZakazky, zamkniZakazku } from "@/lib/zakazky";

/**
 * Výkaz zakázky (krok 2C): řádky práce (den, čas, co se dělalo) a řádky
 * materiálu (název, množství, jednotka). Oprávnění (Jakub, 8. 11. 2026)
 * popisuje `src/lib/vykaz-pravidla.ts`; tady se vynucují:
 * - zakázka se hledá přes `viditelneZakazky()` — cizí zakázka pro
 *   technika neexistuje,
 * - každý zápis **zamkne řádek zakázky** (`zamkniZakazku()`), stejně jako
 *   změna stavu — výkaz se nezmění v půli přepnutí na Hotovo a poslední
 *   práce nezmizí z hotové zakázky,
 * - historie jen „přidána práce“ apod., nikdy hodnoty.
 * Smazání jen vyplní `deletedAt`, každý dotaz proto `deletedAt: null`.
 */

const NEEXISTUJE = "Zakázka neexistuje.";
const RADEK_NEEXISTUJE = "Řádek výkazu už neexistuje. Obnovte stránku.";
const POSLEDNI_PRACE = "Hotová zakázka musí mít zapsanou aspoň jednu práci.";

/** Den práce: platné datum, ne v budoucnu a nejvýš rok zpátky. */
const denSchema = z
  .string()
  .trim()
  .refine((v) => {
    // Tvar se ověří dřív, než se s hodnotou počítá (past zod 4).
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const den = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(den.getTime()) && den.toISOString().slice(0, 10) === v;
  }, "Zadejte platné datum.")
  .refine((v) => v <= dnesVPraze(), "Práci nejde zapsat dopředu.")
  .refine((v) => {
    const pred = new Date(`${dnesVPraze()}T00:00:00Z`);
    pred.setUTCFullYear(pred.getUTCFullYear() - 1);
    return v >= pred.toISOString().slice(0, 10);
  }, "Práce může být nejvýš rok stará.")
  .transform((v) => new Date(`${v}T00:00:00Z`));

/** Celé číslo z pole formuláře (prázdné = 0). */
function cele(max: number, chyba: string) {
  return z
    .string()
    .trim()
    .refine((v) => /^\d{0,4}$/.test(v) && Number(v || "0") <= max, chyba)
    .transform((v) => Number(v || "0"));
}

export const praceSchema = z
  .object({
    den: denSchema,
    hodiny: cele(24, "Hodiny zadejte číslem 0–24."),
    minuty: cele(59, "Minuty zadejte číslem 0–59."),
    poznamka: z
      .string()
      .trim()
      .min(3, "Napište, co se dělalo.")
      .max(1000, "Popis práce může mít nejvýš 1000 znaků."),
  })
  .transform(({ hodiny, minuty, ...zbytek }) => ({ ...zbytek, minut: hodiny * 60 + minuty }))
  .refine((p) => p.minut >= 1 && p.minut <= 24 * 60, "Zadejte odpracovaný čas (nejvýš 24 h).");
export type UdajePrace = z.infer<typeof praceSchema>;

const mnozstviSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, "").replace(",", "."))
  .refine(
    (v) => /^\d{1,8}(\.\d{1,2})?$/.test(v) && Number(v) > 0,
    "Množství zadejte kladným číslem (nejvýš 2 desetinná místa).",
  );

/** Materiál zapsaný ručně (mimo ceník). Cenu bere server jen od toho, kdo ceny vidí. */
const rucniMaterialSchema = z.object({
  nazev: z
    .string()
    .trim()
    .min(2, "Zadejte název materiálu.")
    .max(120, "Název může mít nejvýš 120 znaků."),
  mnozstvi: mnozstviSchema,
  jednotka: z.enum(JEDNOTKY, "Vyberte jednotku."),
  cena: castkaSchema(false)
    .optional()
    .transform((v) => v ?? null),
});

/** Materiál z ceníku (krok 4A): název, jednotku a cenu doplní server z položky. */
const materialZCenikuSchema = z.object({ polozkaId: idSchema, mnozstvi: mnozstviSchema });

export type UdajeMaterialu =
  | ({ druh: "rucne" } & z.infer<typeof rucniMaterialSchema>)
  | ({ druh: "cenik" } & z.infer<typeof materialZCenikuSchema>);

/** Prázdné `polozkaId` = zapsáno ručně, jinak položka ceníku. */
export const materialSchema: z.ZodType<UdajeMaterialu> = z
  .object({ polozkaId: z.string().trim().max(64).catch("") })
  .loose()
  .transform((vstup, ctx): UdajeMaterialu => {
    if (vstup.polozkaId) {
      const zCeniku = materialZCenikuSchema.safeParse(vstup);
      if (zCeniku.success) return { druh: "cenik", ...zCeniku.data };
      for (const i of zCeniku.error.issues) ctx.addIssue({ code: "custom", message: i.message });
      return z.NEVER;
    }
    const rucne = rucniMaterialSchema.safeParse(vstup);
    if (rucne.success) return { druh: "rucne", ...rucne.data };
    for (const i of rucne.error.issues) ctx.addIssue({ code: "custom", message: i.message });
    return z.NEVER;
  });

const POLOZKA_NEEXISTUJE = "Položka ceníku už neexistuje. Obnovte stránku.";

/**
 * Co se zapíše do řádku materiálu. Z ceníku: název, jednotka a cena
 * z položky. Ručně: cenu uloží jen Majitel a Dispečer; u technika zůstane
 * prázdná (doplní ji dispečer) — nebo se ponechá dosavadní ruční cena.
 */
async function radekMaterialu(
  tx: Tx,
  kdo: Prihlaseny,
  udaje: UdajeMaterialu,
  dosavadni?: {
    priceItemId: string | null;
    unitPrice: Prisma.Decimal | null;
    name: string;
    unit: string;
  },
): Promise<
  Vysledek<{
    data: {
      name: string;
      unit: string;
      quantity: string;
      priceItemId: string | null;
      unitPrice: string | Prisma.Decimal | null;
    };
  }>
> {
  if (udaje.druh === "cenik") {
    // Stejná položka jako dosud: cena ze dne zápisu zůstává, mění se jen množství.
    if (dosavadni && dosavadni.priceItemId === udaje.polozkaId) {
      return {
        ok: true,
        data: {
          name: dosavadni.name,
          unit: dosavadni.unit,
          quantity: udaje.mnozstvi,
          priceItemId: dosavadni.priceItemId,
          unitPrice: dosavadni.unitPrice,
        },
      };
    }
    const polozka = await polozkaCeniku(tx, udaje.polozkaId);
    if (!polozka) return { ok: false, chyba: POLOZKA_NEEXISTUJE };
    return {
      ok: true,
      data: {
        name: polozka.name,
        unit: polozka.unit,
        quantity: udaje.mnozstvi,
        priceItemId: polozka.id,
        unitPrice: polozka.price,
      },
    };
  }
  const cena = vidiCeny(kdo.role)
    ? udaje.cena
    : dosavadni && !dosavadni.priceItemId
      ? dosavadni.unitPrice
      : null;
  return {
    ok: true,
    data: {
      name: udaje.nazev,
      unit: udaje.jednotka,
      quantity: udaje.mnozstvi,
      priceItemId: null,
      unitPrice: cena,
    },
  };
}

type Tx = Prisma.TransactionClient;
type Zakazka = { id: string; status: Stav };

/** Zamkne zakázku a najde ji s podmínkou viditelnosti. */
async function najdiZakazku(tx: Tx, kdo: Prihlaseny, id: string): Promise<Zakazka | null> {
  await zamkniZakazku(tx, id);
  const zakazka = await tx.order.findFirst({
    where: { AND: [{ id }, viditelneZakazky(kdo)] },
    select: { id: true, status: true },
  });
  return zakazka ? { id: zakazka.id, status: zakazka.status as Stav } : null;
}

/** Proč tahle role u zakázky v tomhle stavu nesmí psát (nebo null). */
function zamceno(kdo: Prihlaseny, stav: Stav): string | null {
  if (smiPsatDoVykazu(kdo.role, stav)) return null;
  if (stav === "VYFAKTUROVANA") return "Vyfakturovanou zakázku už měnit nejde.";
  return "Výkaz hotové zakázky už měnit nemůžete. Opravu udělá dispečer nebo majitel.";
}

async function historie(tx: Tx, kdo: Prihlaseny, zakazkaId: string, detail: string) {
  await zapisHistorii(tx, {
    userId: kdo.id,
    entity: "zakazka",
    entityId: zakazkaId,
    action: "vykaz",
    detail,
  });
}

/**
 * Výkaz k zakázce, kterou už stránka našla přes `detailZakazky()` (tím je
 * ověřené, že ji ten člověk smí vidět). U každého řádku je, jestli ho smí
 * měnit — rozhraní podle toho ukáže tlačítka, akce to ověří znovu.
 */
export async function nactiVykaz(kdo: Prihlaseny, zakazkaId: string, stav: Stav) {
  const [prace, material] = await Promise.all([
    db.workEntry.findMany({
      where: { orderId: zakazkaId, deletedAt: null },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        minutes: true,
        note: true,
        hourlyRate: true,
        userId: true,
        user: { select: { name: true } },
      },
    }),
    db.materialEntry.findMany({
      where: { orderId: zakazkaId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        quantity: true,
        unit: true,
        priceItemId: true,
        unitPrice: true,
        userId: true,
        user: { select: { name: true } },
      },
    }),
  ]);
  // Ceny (krok 4A) jen pro Majitele a Dispečera — technikovi se ani nepošlou.
  const ceny = vidiCeny(kdo.role);
  const radkyPrace = prace.map((p) => {
    const sazba = naHalere(p.hourlyRate);
    return {
      id: p.id,
      den: p.date.toISOString().slice(0, 10),
      minut: p.minutes,
      poznamka: p.note,
      zapsal: p.user.name,
      smiMenit: smiMenitRadek(kdo, stav, p.userId),
      ...(ceny ? { sazba, cena: cenaPrace(p.minutes, sazba) } : {}),
    };
  });
  const radkyMaterialu = material.map((m) => {
    const mnozstvi = m.quantity.toString();
    const cenaJednotky = m.unitPrice === null ? null : naHalere(m.unitPrice);
    return {
      id: m.id,
      nazev: m.name,
      mnozstvi,
      jednotka: m.unit,
      polozkaId: m.priceItemId,
      zapsal: m.user.name,
      smiMenit: smiMenitRadek(kdo, stav, m.userId),
      ...(ceny
        ? {
            cenaJednotky,
            cena: cenaJednotky === null ? null : cenaMaterialu(mnozstvi, cenaJednotky),
          }
        : {}),
    };
  });
  return {
    smiPsat: smiPsatDoVykazu(kdo.role, stav),
    celkemMinut: prace.reduce((soucet, p) => soucet + p.minutes, 0),
    prace: radkyPrace,
    material: radkyMaterialu,
    ceny: ceny ? souhrnCen(radkyPrace, radkyMaterialu) : null,
  };
}

/** Cena zakázky z řádků výkazu (v haléřích). Materiál bez ceny se počítá zvlášť. */
export function souhrnCen(prace: { cena?: number }[], material: { cena?: number | null }[]) {
  const zaPraci = prace.reduce((s, p) => s + (p.cena ?? 0), 0);
  const zaMaterial = material.reduce((s, m) => s + (m.cena ?? 0), 0);
  const bezDph = zaPraci + zaMaterial;
  const castkaDph = dph(bezDph);
  return {
    zaPraci,
    zaMaterial,
    bezDph,
    dph: castkaDph,
    sDph: bezDph + castkaDph,
    chybiCena: material.filter((m) => m.cena === null).length,
  };
}

export async function pridejPraci(
  kdo: Prihlaseny,
  zakazkaId: string,
  udaje: UdajePrace,
): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const zakazka = await najdiZakazku(tx, kdo, zakazkaId);
    if (!zakazka) return { ok: false as const, chyba: NEEXISTUJE };
    const proc = zamceno(kdo, zakazka.status);
    if (proc) return { ok: false as const, chyba: proc };
    // Sazba ve chvíli zápisu (krok 4A): změna ceníku řádek nepřecení.
    const sazba = await aktualniSazba(tx);
    await tx.workEntry.create({
      data: {
        id: randomUUID(),
        orderId: zakazka.id,
        userId: kdo.id,
        date: udaje.den,
        minutes: udaje.minut,
        note: udaje.poznamka,
        hourlyRate: (sazba / 100).toFixed(2),
      },
    });
    await historie(tx, kdo, zakazka.id, "přidána práce");
    return { ok: true as const };
  });
}

export async function pridejMaterial(
  kdo: Prihlaseny,
  zakazkaId: string,
  udaje: UdajeMaterialu,
): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const zakazka = await najdiZakazku(tx, kdo, zakazkaId);
    if (!zakazka) return { ok: false as const, chyba: NEEXISTUJE };
    const proc = zamceno(kdo, zakazka.status);
    if (proc) return { ok: false as const, chyba: proc };
    const radek = await radekMaterialu(tx, kdo, udaje);
    if (!radek.ok) return radek;
    await tx.materialEntry.create({
      data: { id: randomUUID(), orderId: zakazka.id, userId: kdo.id, ...radek.data },
    });
    await historie(tx, kdo, zakazka.id, "přidán materiál");
    return { ok: true as const };
  });
}

/**
 * Najde řádek, zamkne jeho zakázku a ověří, že ho ten člověk smí měnit.
 * Technikovi se řádek cizí zakázky jeví jako neexistující.
 */
async function radekKeZmene(
  tx: Tx,
  kdo: Prihlaseny,
  druh: "prace" | "material",
  radekId: string,
): Promise<Vysledek<{ zakazka: Zakazka }>> {
  const radek =
    druh === "prace"
      ? await tx.workEntry.findFirst({
          where: { id: radekId, deletedAt: null },
          select: { orderId: true },
        })
      : await tx.materialEntry.findFirst({
          where: { id: radekId, deletedAt: null },
          select: { orderId: true },
        });
  if (!radek) return { ok: false, chyba: RADEK_NEEXISTUJE };
  const zakazka = await najdiZakazku(tx, kdo, radek.orderId);
  if (!zakazka) return { ok: false, chyba: RADEK_NEEXISTUJE };
  const proc = zamceno(kdo, zakazka.status);
  if (proc) return { ok: false, chyba: proc };
  // Po zámku znovu: řádek mohl mezitím někdo smazat.
  const zapsal =
    druh === "prace"
      ? await tx.workEntry.findFirst({
          where: { id: radekId, deletedAt: null },
          select: { userId: true },
        })
      : await tx.materialEntry.findFirst({
          where: { id: radekId, deletedAt: null },
          select: { userId: true },
        });
  if (!zapsal) return { ok: false, chyba: RADEK_NEEXISTUJE };
  if (!smiMenitRadek(kdo, zakazka.status, zapsal.userId)) {
    return { ok: false, chyba: "Měnit můžete jen řádky, které jste zapsali." };
  }
  return { ok: true, zakazka };
}

export async function upravPraci(
  kdo: Prihlaseny,
  radekId: string,
  udaje: UdajePrace,
): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const radek = await radekKeZmene(tx, kdo, "prace", radekId);
    if (!radek.ok) return radek;
    await tx.workEntry.update({
      where: { id: radekId },
      data: { date: udaje.den, minutes: udaje.minut, note: udaje.poznamka },
    });
    await historie(tx, kdo, radek.zakazka.id, "upravena práce");
    return { ok: true as const };
  });
}

export async function upravMaterial(
  kdo: Prihlaseny,
  radekId: string,
  udaje: UdajeMaterialu,
): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const radek = await radekKeZmene(tx, kdo, "material", radekId);
    if (!radek.ok) return radek;
    const dosavadni = await tx.materialEntry.findUniqueOrThrow({
      where: { id: radekId },
      select: { priceItemId: true, unitPrice: true, name: true, unit: true },
    });
    const novy = await radekMaterialu(tx, kdo, udaje, dosavadni);
    if (!novy.ok) return novy;
    await tx.materialEntry.update({ where: { id: radekId }, data: novy.data });
    await historie(tx, kdo, radek.zakazka.id, "upraven materiál");
    return { ok: true as const };
  });
}

export async function smazPraci(kdo: Prihlaseny, radekId: string): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const radek = await radekKeZmene(tx, kdo, "prace", radekId);
    if (!radek.ok) return radek;
    if (STAVY_S_PRACI.includes(radek.zakazka.status)) {
      const zbyva = await tx.workEntry.count({
        where: { orderId: radek.zakazka.id, deletedAt: null },
      });
      if (zbyva <= 1) return { ok: false as const, chyba: POSLEDNI_PRACE };
    }
    await tx.workEntry.update({ where: { id: radekId }, data: { deletedAt: new Date() } });
    await historie(tx, kdo, radek.zakazka.id, "smazána práce");
    return { ok: true as const };
  });
}

export async function smazMaterial(kdo: Prihlaseny, radekId: string): Promise<Vysledek> {
  return db.$transaction(async (tx) => {
    const radek = await radekKeZmene(tx, kdo, "material", radekId);
    if (!radek.ok) return radek;
    await tx.materialEntry.update({ where: { id: radekId }, data: { deletedAt: new Date() } });
    await historie(tx, kdo, radek.zakazka.id, "smazán materiál");
    return { ok: true as const };
  });
}

/** Má zakázka zapsanou aspoň jednu práci? (podmínka pro Hotovo, volá se pod zámkem) */
export async function maPraci(tx: Tx, zakazkaId: string): Promise<boolean> {
  const pocet = await tx.workEntry.count({ where: { orderId: zakazkaId, deletedAt: null } });
  return pocet > 0;
}
