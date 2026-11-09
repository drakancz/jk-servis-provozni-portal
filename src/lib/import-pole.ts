/**
 * Import z Excelu (krok 3A): údaje portálu, ke kterým se přiřazují sloupce
 * tabulky, a návrh přiřazení podle názvů sloupců. Bez databáze — smí i do
 * prohlížeče. Kontrola hodnot po řádcích a uložení přijdou v kroku 3B.
 */

export const POLE_IMPORTU = [
  { id: "zakaznik", nazev: "Zákazník", povinne: true },
  { id: "telefon", nazev: "Telefon", povinne: false },
  { id: "email", nazev: "E-mail", povinne: false },
  { id: "misto", nazev: "Místo výjezdu", povinne: true },
  { id: "popis", nazev: "Co je potřeba udělat", povinne: true },
  { id: "termin", nazev: "Termín", povinne: false },
  { id: "stav", nazev: "Stav", povinne: false },
  { id: "technik", nazev: "Technik", povinne: false },
] as const;
export type PoleImportu = (typeof POLE_IMPORTU)[number]["id"];

/** Přiřazení: údaj portálu → index sloupce tabulky (nebo null = nepoužít). */
export type Prirazeni = Record<PoleImportu, number | null>;

/** Limity nahraného souboru (hlídá je server, prohlížeč jen předem upozorní). */
export const LIMITY = {
  velikost: 2 * 1024 * 1024,
  rozbaleno: 50 * 1024 * 1024,
  radku: 1000,
  sloupcu: 30,
  delkaBunky: 2000,
} as const;

/** Text bez diakritiky, malými písmeny, jen písmena a čísla oddělená mezerou. */
function prosty(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Slova, podle kterých se pozná sloupec. Pořadí v `POLE_IMPORTU` rozhoduje,
 * když by sloupec seděl na víc údajů — každý sloupec dostane nejvýš jeden.
 */
const SLOVA: Record<PoleImportu, string[]> = {
  zakaznik: ["zakaznik", "firma", "klient", "odberatel", "objednatel", "nazev", "jmeno"],
  telefon: ["telefon", "tel", "mobil", "kontakt"],
  email: ["email", "e mail", "mail"],
  misto: ["misto", "adresa", "kam", "lokalita", "obec", "mesto", "ulice"],
  popis: ["popis", "zavada", "pozadavek", "prace", "ukol", "co", "poznamka", "oprava"],
  termin: ["termin", "datum", "kdy", "den"],
  stav: ["stav", "status"],
  technik: ["technik", "servisak", "montaznik", "pridelen", "kdo", "resi"],
};

/** Navrhne přiřazení podle názvů sloupců (i bez diakritiky, „E-mail“ = „email“). */
export function navrhniPrirazeni(zahlavi: string[]): Prirazeni {
  const slova = zahlavi.map((z) => prosty(z).split(" "));
  const pouzite = new Set<number>();
  const prirazeni = {} as Prirazeni;
  for (const { id } of POLE_IMPORTU) {
    const index = slova.findIndex(
      (s, i) =>
        !pouzite.has(i) &&
        SLOVA[id].some((hledane) =>
          hledane.includes(" ") ? s.join(" ").includes(hledane) : s.includes(hledane),
        ),
    );
    prirazeni[id] = index === -1 ? null : index;
    if (index !== -1) pouzite.add(index);
  }
  return prirazeni;
}

/** Písmeno sloupce jako v Excelu (0 → A, 26 → AA). */
export function pismenoSloupce(index: number): string {
  let n = index + 1;
  let pismeno = "";
  while (n > 0) {
    const zbytek = (n - 1) % 26;
    pismeno = String.fromCharCode(65 + zbytek) + pismeno;
    n = Math.floor((n - 1) / 26);
  }
  return pismeno;
}

/** Český tvar podle počtu (1 řádek, 2 řádky, 5 řádků). */
export function tvar(n: number, jeden: string, dva: string, pet: string): string {
  if (n === 1) return jeden;
  if (n >= 2 && n <= 4) return dva;
  return pet;
}

export function radku(n: number): string {
  return tvar(n, "řádek", "řádky", "řádků");
}
