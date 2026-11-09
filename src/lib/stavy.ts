/** Stavy zakázky a jejich názvy (krok 2B). Bez databáze — smí i do prohlížeče. */
export const STAVY = ["NOVA", "PRIDELENA", "V_PRACI", "HOTOVA", "VYFAKTUROVANA"] as const;
export type Stav = (typeof STAVY)[number];

export const NAZEV_STAVU: Record<Stav, string> = {
  NOVA: "Nová",
  PRIDELENA: "Přidělená",
  V_PRACI: "V práci",
  HOTOVA: "Hotová",
  VYFAKTUROVANA: "Vyfakturovaná",
};

/** Kroky, které smí technik u své zakázky (Jakub, 8. 11. 2026): jen dopředu. */
export const KROK_TECHNIKA: Partial<Record<Stav, { na: Stav; tlacitko: string }>> = {
  PRIDELENA: { na: "V_PRACI", tlacitko: "Začít práci" },
  V_PRACI: { na: "HOTOVA", tlacitko: "Hotovo" },
};

/** Stavy, které potřebují přiděleného technika. */
export const STAVY_S_TECHNIKEM: readonly Stav[] = [
  "PRIDELENA",
  "V_PRACI",
  "HOTOVA",
  "VYFAKTUROVANA",
];

/**
 * Smí tahle role přejít ze stavu `z` do stavu `na`? Technik navíc jen
 * u své zakázky (hlídá dotaz v `zmenStav()`). Vyfakturovaná jen Majitel.
 */
export function smiZmenitStav(
  role: "MAJITEL" | "DISPECER" | "TECHNIK",
  z: Stav,
  na: Stav,
): boolean {
  if (z === na) return false;
  if (role === "TECHNIK") return KROK_TECHNIKA[z]?.na === na;
  if (role === "DISPECER") return z !== "VYFAKTUROVANA" && na !== "VYFAKTUROVANA";
  return true;
}
