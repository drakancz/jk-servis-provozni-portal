/**
 * Ukázkový režim (krok 5A, Jakub 9. 11. 2026). Zapíná se proměnnou
 * `UKAZKA=1` (na Railway ji nastavuje Jakub). Bez ní se portál chová
 * přesně jako dřív — doma, v testech i kdekoli jinde.
 *
 * Rozhodnutí Jakuba:
 * - **tři účty se známým heslem** (Majitel, Dispečer, Technik), na
 *   přihlašovací stránce tlačítka „Vyzkoušet jako …“ a vypsané údaje —
 *   heslo je veřejné **schválně**, data jsou vymyšlená,
 * - **obnova dat při prvním otevření nového (pražského) dne** — bez
 *   plánované služby, usínající aplikaci nic nebudí,
 * - **chráněné jsou jen tři ukázkové účty** (role, zrušení, odkaz na nové
 *   heslo); další uživatele smí návštěvník zakládat i rušit, v noci zmizí,
 * - **bohatší data kolem dnešního týdne** (`src/lib/ukazka-data.ts`).
 *
 * Bez databáze — konstanty smí i do prohlížeče.
 */

export function jeUkazka(): boolean {
  return process.env.UKAZKA === "1";
}

/** Veřejné heslo ukázkových účtů (Better Auth chce aspoň 12 znaků). */
export const HESLO_UKAZKY = "ukazka-jkservis";

export const UKAZKOVE_UCTY = [
  {
    id: "ukazka-majitel",
    name: "Jana Králová",
    email: "majitel@jkservis.example",
    role: "MAJITEL",
  },
  {
    id: "ukazka-dispecer",
    name: "Petr Dvořák",
    email: "dispecer@jkservis.example",
    role: "DISPECER",
  },
  { id: "ukazka-technik", name: "Tomáš Beneš", email: "technik@jkservis.example", role: "TECHNIK" },
] as const;

/** E-maily účtů, které návštěvník nesmí změnit ani zrušit. */
const CHRANENE = new Set<string>(UKAZKOVE_UCTY.map((u) => u.email));

/** Je to v ukázkovém režimu chráněný účet? Mimo ukázku vždy `false`. */
export function jeChranenyUcet(email: string): boolean {
  return jeUkazka() && CHRANENE.has(email.toLowerCase());
}

export const CHRANENY_UCET =
  "Ukázkový účet měnit nejde — ostatní návštěvníci by se pak nepřihlásili.";
