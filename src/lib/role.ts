/** Role a jejich názvy (krok 1C). Bez napojení na databázi — smí i do prohlížeče. */
export const ROLE = ["MAJITEL", "DISPECER", "TECHNIK"] as const;
export type Role = (typeof ROLE)[number];
export const NAZEV_ROLE: Record<Role, string> = {
  MAJITEL: "Majitel",
  DISPECER: "Dispečer",
  TECHNIK: "Technik",
};

/** Datum a čas vždy v pražském čase (na serveru i v prohlížeči stejně). */
export const DATUM_CAS = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
