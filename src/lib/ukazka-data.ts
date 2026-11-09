/**
 * Ukázková data (krok 5A, Jakub 9. 11. 2026): vymyšlená servisní firma
 * JK servis s.r.o. Termíny a výkazy se počítají **od dnešního dne**, takže
 * Přehled a kalendář týdne vypadají živě každý den. Všechno je vymyšlené —
 * firmy, jména, telefony (`+420 600 000 …`) i adresy.
 */

/** Další technici bez přihlášení (jen aby bylo komu přidělovat). */
export const DALSI_TECHNICI = [
  { id: "ukazka-technik-2", name: "Lukáš Horák", email: "lukas.horak@jkservis.example" },
  { id: "ukazka-technik-3", name: "Martin Svoboda", email: "martin.svoboda@jkservis.example" },
] as const;

export const SAZBA_UKAZKY = "650";

export const CENIK_UKAZKY = [
  { id: "ukazka-cenik-jistic", name: "Jistič B16 1f", unit: "ks", price: "189" },
  { id: "ukazka-cenik-kabel", name: "Kabel CYKY 3×2,5", unit: "m", price: "32" },
  { id: "ukazka-cenik-termostat", name: "Termostat prostorový", unit: "ks", price: "1290" },
  { id: "ukazka-cenik-trubka", name: "Měděná trubka 15 mm", unit: "m", price: "210" },
  { id: "ukazka-cenik-tesneni", name: "Sada těsnění", unit: "bal", price: "85" },
  { id: "ukazka-cenik-ventil", name: 'Kulový ventil 1/2"', unit: "ks", price: "245" },
  { id: "ukazka-cenik-filtr", name: "Filtr do rekuperace", unit: "ks", price: "390" },
  { id: "ukazka-cenik-chladivo", name: "Chladivo R32", unit: "kg", price: "980" },
] as const;

export const ZAKAZNICI_UKAZKY = [
  {
    id: "ukazka-z-1",
    name: "Pekárna U Mlýna s.r.o.",
    ico: "00000001",
    phone: "+420 600 000 101",
    address: "Mlýnská 12, Žďár nad Sázavou",
  },
  {
    id: "ukazka-z-2",
    name: "Autoservis Kovář",
    ico: null,
    phone: "+420 600 000 102",
    address: "Průmyslová 4, Nové Město na Moravě",
  },
  {
    id: "ukazka-z-3",
    name: "SVJ Lipová 8",
    ico: "00000002",
    phone: "+420 600 000 103",
    address: "Lipová 8, Žďár nad Sázavou",
  },
  {
    id: "ukazka-z-4",
    name: "Hana Malá",
    ico: null,
    phone: "+420 600 000 104",
    address: "Polní 31, Bystřice nad Pernštejnem",
  },
  {
    id: "ukazka-z-5",
    name: "Penzion Na Vyhlídce",
    ico: "00000003",
    phone: "+420 600 000 105",
    address: "Vyhlídka 2, Svratka",
  },
  {
    id: "ukazka-z-6",
    name: "Základní škola Komenského",
    ico: "00000004",
    phone: "+420 600 000 106",
    address: "Komenského 6, Velké Meziříčí",
  },
  {
    id: "ukazka-z-7",
    name: "Kadeřnictví Viola",
    ico: null,
    phone: "+420 600 000 107",
    address: "Náměstí 15, Žďár nad Sázavou",
  },
  {
    id: "ukazka-z-8",
    name: "Jiří Novotný",
    ico: null,
    phone: "+420 600 000 108",
    address: "Zahradní 9, Radostín nad Oslavou",
  },
] as const;

type Technik = "technik" | "technik-2" | "technik-3" | null;
type Stav = "NOVA" | "PRIDELENA" | "V_PRACI" | "HOTOVA" | "VYFAKTUROVANA";

/** Zakázka ukázky; `termin` a dny výkazu jsou posuny od dneška ve dnech. */
type ZakazkaUkazky = {
  zakaznik: number;
  misto?: string;
  popis: string;
  termin: number | null;
  stav: Stav;
  technik: Technik;
  prace?: { den: number; minut: number; co: string }[];
  material?: { polozka: number; mnozstvi: string }[];
};

/** Pořadí = číslo zakázky (obnova začíná číslovat od 1). */
export const ZAKAZKY_UKAZKY: ZakazkaUkazky[] = [
  {
    zakaznik: 1,
    popis: "Roční revize elektroinstalace výrobny a protokol.",
    termin: -20,
    stav: "VYFAKTUROVANA",
    technik: "technik",
    prace: [{ den: -20, minut: 300, co: "Revize rozvaděčů a zásuvkových okruhů, protokol." }],
    material: [{ polozka: 0, mnozstvi: "3" }],
  },
  {
    zakaznik: 5,
    popis: "Servis kotle před topnou sezónou.",
    termin: -14,
    stav: "VYFAKTUROVANA",
    technik: "technik-2",
    prace: [{ den: -14, minut: 150, co: "Vyčištění kotle, kontrola spalin, výměna těsnění." }],
    material: [{ polozka: 4, mnozstvi: "1" }],
  },
  {
    zakaznik: 3,
    misto: "Lipová 8, vchod B, sklep",
    popis: "Kape kulový ventil u rozdělovače topení.",
    termin: -6,
    stav: "HOTOVA",
    technik: "technik",
    prace: [{ den: -6, minut: 90, co: "Výměna ventilu, napuštění a odvzdušnění." }],
    material: [
      { polozka: 5, mnozstvi: "2" },
      { polozka: 4, mnozstvi: "1" },
    ],
  },
  {
    zakaznik: 2,
    popis: "Nefunguje osvětlení dílny, vypadává jistič.",
    termin: -4,
    stav: "HOTOVA",
    technik: "technik-3",
    prace: [{ den: -4, minut: 120, co: "Nalezen zkrat ve svítidle, výměna jističe a kabelu." }],
    material: [
      { polozka: 0, mnozstvi: "1" },
      { polozka: 1, mnozstvi: "12" },
    ],
  },
  {
    zakaznik: 7,
    popis: "Výměna filtrů rekuperace a kontrola výkonu.",
    termin: -2,
    stav: "HOTOVA",
    technik: "technik-2",
    prace: [{ den: -2, minut: 60, co: "Výměna filtrů, měření průtoku." }],
    material: [{ polozka: 6, mnozstvi: "2" }],
  },
  {
    zakaznik: 4,
    popis: "Klimatizace v ložnici málo chladí.",
    termin: -3,
    stav: "PRIDELENA",
    technik: "technik-3",
  },
  {
    zakaznik: 6,
    misto: "Komenského 6, tělocvična",
    popis: "Revize nouzového osvětlení.",
    termin: -1,
    stav: "V_PRACI",
    technik: "technik",
    prace: [{ den: -1, minut: 180, co: "Kontrola 24 svítidel, 3 vadné baterie." }],
  },
  {
    zakaznik: 8,
    popis: "Nový termostat a regulace podlahového topení.",
    termin: 0,
    stav: "V_PRACI",
    technik: "technik",
    prace: [{ den: 0, minut: 75, co: "Demontáž starého termostatu, příprava kabeláže." }],
    material: [{ polozka: 2, mnozstvi: "1" }],
  },
  {
    zakaznik: 1,
    misto: "Mlýnská 12, sklad mouky",
    popis: "Kontrola chlazení skladu, hlučný kompresor.",
    termin: 0,
    stav: "PRIDELENA",
    technik: "technik-2",
  },
  {
    zakaznik: 5,
    popis: "Doplnění chladiva do klimatizace pokojů 3 a 4.",
    termin: 1,
    stav: "PRIDELENA",
    technik: "technik-3",
  },
  {
    zakaznik: 3,
    popis: "Odečet a seřízení topení po výměně radiátorů.",
    termin: 2,
    stav: "PRIDELENA",
    technik: "technik",
  },
  {
    zakaznik: 2,
    popis: "Montáž zásuvek 400 V pro nový kompresor.",
    termin: 3,
    stav: "NOVA",
    technik: null,
  },
  {
    zakaznik: 6,
    popis: "Výměna vodovodních baterií ve školní jídelně.",
    termin: 4,
    stav: "NOVA",
    technik: null,
  },
  {
    zakaznik: 4,
    popis: "Prohlídka rozvodů vody před rekonstrukcí koupelny.",
    termin: 8,
    stav: "NOVA",
    technik: null,
  },
  {
    zakaznik: 7,
    popis: "Nabídka na novou klimatizaci salonu.",
    termin: null,
    stav: "NOVA",
    technik: null,
  },
];
