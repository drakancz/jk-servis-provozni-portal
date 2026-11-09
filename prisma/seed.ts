import { randomBytes, randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";

import { PrismaClient, type Role } from "../src/generated/prisma/client";
import { hledaciText } from "../src/lib/hledani";

/**
 * Ukázková data (krok 1B): tři vymyšlené účty, ať se dá přihlásit,
 * dokud nepřibude správa uživatelů (krok 1C).
 *
 * Heslo (Jakub, 7. 11. 2026) je **náhodné při každém naplnění** — žádné
 * heslo v repozitáři. Testy si ho předají v `SEED_HESLO`, ve vývoji ho
 * skript jednou vypíše do terminálu. Známé heslo pro zájemce přijde až
 * s ukázkovým režimem (krok 5A).
 *
 * docker compose run --rm web npm run db:seed
 */

const UCTY: { name: string; email: string; role: Role }[] = [
  { name: "Jana Králová", email: "majitel@jkservis.example", role: "MAJITEL" },
  { name: "Petr Dvořák", email: "dispecer@jkservis.example", role: "DISPECER" },
  { name: "Tomáš Beneš", email: "technik@jkservis.example", role: "TECHNIK" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Chybí DATABASE_URL.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const zadane = process.env.SEED_HESLO;
  const heslo = zadane || randomBytes(12).toString("base64url");
  const otisk = await hashPassword(heslo);

  for (const ucet of UCTY) {
    const uzivatel = await db.user.upsert({
      where: { email: ucet.email },
      update: { name: ucet.name, role: ucet.role, deletedAt: null },
      create: { id: randomUUID(), ...ucet, emailVerified: true },
    });
    await db.account.deleteMany({ where: { userId: uzivatel.id, providerId: "credential" } });
    await db.account.create({
      data: {
        id: randomUUID(),
        accountId: uzivatel.id,
        providerId: "credential",
        userId: uzivatel.id,
        password: otisk,
      },
    });
  }

  await zakazniciAZakazky(db);
  await cenik(db);
  await vykaz(db);

  console.log(`Ukázkové účty: ${UCTY.map((u) => u.email).join(", ")}`);
  if (!zadane) console.log(`Heslo pro všechny tři (jen tento běh): ${heslo}`);
  await db.$disconnect();
}

main().catch((chyba) => {
  console.error(chyba);
  process.exit(1);
});

/**
 * Vymyšlení zákazníci a zakázky (krok 2A), ať ukázka není prázdná.
 * Pevná id → opakované naplnění nic nezdvojí. Čísla zakázek přidělí databáze.
 */
const ZAKAZNICI = [
  {
    id: "seed-zakaznik-1",
    name: "Pekárna U Lípy s.r.o.",
    ico: "12345678",
    phone: "+420 601 111 222",
    email: "provoz@pekarna-lipa.example",
    address: "Lipová 12, Liberec",
  },
  {
    id: "seed-zakaznik-2",
    name: "Bytové družstvo Šumava",
    ico: "87654321",
    phone: "+420 602 333 444",
    email: "spravce@bd-sumava.example",
    address: "Šumavská 1450, Česká Lípa",
  },
  {
    id: "seed-zakaznik-3",
    name: "Marie Vlčková",
    ico: null,
    phone: "+420 603 555 666",
    email: null,
    address: "Zahradní 7, Nový Bor",
  },
  {
    id: "seed-zakaznik-4",
    name: "Autoservis Jizera",
    ico: "24681357",
    phone: "+420 604 777 888",
    email: "dilna@autoservis-jizera.example",
    address: "Průmyslová 3, Jablonec nad Nisou",
  },
];

// Stavy a přidělení (krok 2B): technik ukázky má jednu zakázku přidělenou,
// jednu v práci a jednu hotovou; dvě jsou nové.
const ZAKAZKY: {
  id: string;
  customerId: string;
  place: string;
  description: string;
  dueDate: string | null;
  status?: "PRIDELENA" | "V_PRACI" | "HOTOVA";
  technik?: boolean;
}[] = [
  {
    id: "seed-zakazka-1",
    customerId: "seed-zakaznik-1",
    place: "Lipová 12, Liberec — výrobna",
    description: "Pravidelný servis pece a kontrola těsnění dvířek.",
    dueDate: "2026-11-12",
  },
  {
    id: "seed-zakazka-2",
    customerId: "seed-zakaznik-2",
    place: "Šumavská 1450, Česká Lípa — kotelna",
    description: "Kotel hlásí chybu E4, v domě netopí. Nahlášeno správcem.",
    dueDate: "2026-11-10",
    status: "V_PRACI",
    technik: true,
  },
  {
    id: "seed-zakazka-3",
    customerId: "seed-zakaznik-3",
    place: "Zahradní 7, Nový Bor",
    description: "Kape baterie v kuchyni, výměna kartuše.",
    dueDate: null,
  },
  {
    id: "seed-zakazka-4",
    customerId: "seed-zakaznik-4",
    place: "Průmyslová 3, Jablonec nad Nisou — dílna",
    description: "Revize elektroinstalace dílny a zvedáků.",
    dueDate: "2026-11-20",
    status: "HOTOVA",
    technik: true,
  },
  {
    id: "seed-zakazka-5",
    customerId: "seed-zakaznik-2",
    place: "Šumavská 1452, Česká Lípa — 3. patro",
    description: "Nefunkční zvonek a domácí telefon u bytu č. 12.",
    dueDate: null,
    status: "PRIDELENA",
    technik: true,
  },
];

async function zakazniciAZakazky(db: PrismaClient) {
  for (const z of ZAKAZNICI) {
    const data = { ...z, search: hledaciText(z.name, z.ico, z.phone, z.email, z.address) };
    await db.customer.upsert({
      where: { id: z.id },
      update: { ...data, deletedAt: null },
      create: data,
    });
  }
  const technik = await db.user.findUnique({
    where: { email: "technik@jkservis.example" },
    select: { id: true },
  });
  for (const { technik: sTechnikem, status, ...z } of ZAKAZKY) {
    const data = {
      ...z,
      status: status ?? ("NOVA" as const),
      technicianId: sTechnikem ? (technik?.id ?? null) : null,
      dueDate: z.dueDate ? new Date(`${z.dueDate}T00:00:00Z`) : null,
      search: hledaciText(z.place, z.description),
    };
    await db.order.upsert({
      where: { id: z.id },
      update: { ...data, deletedAt: null },
      create: data,
    });
  }
  console.log(`Ukázkoví zákazníci: ${ZAKAZNICI.length}, zakázky: ${ZAKAZKY.length}`);
}

// Výkaz (krok 2C): rozpracovaná zakázka má jeden řádek práce, hotová dva
// a materiál. Hotová zakázka bez práce by porušila pravidlo pro Hotovo.
const PRACE = [
  {
    id: "seed-prace-1",
    orderId: "seed-zakazka-2",
    date: "2026-11-06",
    minutes: 90,
    note: "Diagnostika kotle, vadné čidlo průtoku. Objednán díl.",
  },
  {
    id: "seed-prace-2",
    orderId: "seed-zakazka-4",
    date: "2026-11-03",
    minutes: 240,
    note: "Revize rozvaděče a zásuvkových okruhů dílny.",
  },
  {
    id: "seed-prace-3",
    orderId: "seed-zakazka-4",
    date: "2026-11-04",
    minutes: 150,
    note: "Kontrola zvedáků, výměna jističe, protokol předán.",
  },
];
const MATERIAL = [
  {
    id: "seed-material-1",
    orderId: "seed-zakazka-4",
    name: "Jistič B16 1f",
    priceItemId: "seed-cenik-jistic",
    unitPrice: "189",
    quantity: "2",
    unit: "ks",
  },
  {
    id: "seed-material-2",
    orderId: "seed-zakazka-4",
    name: "Kabel CYKY 3×2,5",
    priceItemId: "seed-cenik-kabel",
    unitPrice: "32",
    quantity: "7.5",
    unit: "m",
  },
];

async function vykaz(db: PrismaClient) {
  const technik = await db.user.findUnique({
    where: { email: "technik@jkservis.example" },
    select: { id: true },
  });
  if (!technik) return;
  for (const p of PRACE) {
    const data = {
      ...p,
      userId: technik.id,
      date: new Date(`${p.date}T00:00:00Z`),
      hourlyRate: "650",
      deletedAt: null,
    };
    await db.workEntry.upsert({ where: { id: p.id }, update: data, create: data });
  }
  for (const m of MATERIAL) {
    const data = { ...m, userId: technik.id, deletedAt: null };
    await db.materialEntry.upsert({ where: { id: m.id }, update: data, create: data });
  }
  console.log(`Ukázkový výkaz: ${PRACE.length} řádky práce, ${MATERIAL.length} materiálu`);
}

/** Ceník (krok 4A): sazba 650 Kč/h bez DPH a pár položek materiálu. */
const CENIK = [
  { id: "seed-cenik-jistic", name: "Jistič B16 1f", unit: "ks", price: "189" },
  { id: "seed-cenik-kabel", name: "Kabel CYKY 3×2,5", unit: "m", price: "32" },
  { id: "seed-cenik-termostat", name: "Termostat prostorový", unit: "ks", price: "1290" },
  { id: "seed-cenik-trubka", name: "Měděná trubka 15 mm", unit: "m", price: "210" },
  { id: "seed-cenik-tesneni", name: "Sada těsnění", unit: "bal", price: "85" },
];

async function cenik(db: PrismaClient) {
  await db.setting.upsert({
    where: { id: "firma" },
    update: { hourlyRate: "650" },
    create: { id: "firma", hourlyRate: "650" },
  });
  for (const p of CENIK) {
    const data = { ...p, search: hledaciText(p.name), deletedAt: null };
    await db.priceItem.upsert({ where: { id: p.id }, update: data, create: data });
  }
  console.log(`Ukázkový ceník: sazba 650 Kč/h, ${CENIK.length} položek materiálu`);
}
