/**
 * Ceny (krok 4A) bez databáze — smí i do prohlížeče. Rozhodnutí Jakuba
 * (9. 11. 2026):
 * - **ceník mění jen Majitel, ceny vidí Majitel a Dispečer**, Technik je
 *   nevidí vůbec (server mu je ani nepošle),
 * - **jedna hodinová sazba firmy** a materiál z ceníku; materiál mimo
 *   ceník jde zapsat ručně i s cenou,
 * - **ceny bez DPH**, u zakázky celkem bez DPH i s DPH 21 %.
 *
 * Počítá se v haléřích (celá čísla), aby se nesčítaly chyby desetinných
 * čísel.
 */

type Role = "MAJITEL" | "DISPECER" | "TECHNIK";

/** Sazba DPH v procentech (firma je plátce, jedna sazba). */
export const DPH_PROCENT = 21;

/** Smí tahle role vidět ceny? */
export function vidiCeny(role: Role): boolean {
  return role === "MAJITEL" || role === "DISPECER";
}

/** Částka z databáze („650.00“) na haléře. */
export function naHalere(castka: { toString(): string } | string | number): number {
  return Math.round(Number(castka.toString()) * 100);
}

/** Cena práce: minuty × hodinová sazba, zaokrouhleno na haléře. */
export function cenaPrace(minut: number, sazbaHalere: number): number {
  return Math.round((minut * sazbaHalere) / 60);
}

/** Cena materiálu: množství × cena za jednotku, zaokrouhleno na haléře. */
export function cenaMaterialu(mnozstvi: string, cenaHalere: number): number {
  return Math.round(Number(mnozstvi) * cenaHalere);
}

/** DPH z částky bez DPH (v haléřích). */
export function dph(halere: number): number {
  return Math.round((halere * DPH_PROCENT) / 100);
}

const KC = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** „1 234,50 Kč“ z haléřů. */
export function korun(halere: number): string {
  return KC.format(halere / 100);
}

/** Částka do pole formuláře („650,5“) z haléřů. */
export function doPole(halere: number): string {
  return (halere / 100).toString().replace(".", ",");
}

/**
 * Cena zakázky bez DPH v haléřích z řádků výkazu (export, přehled).
 * Materiál bez ceny se nepočítá.
 */
export function cenaZakazkyBezDph(
  prace: { minutes: number; hourlyRate: { toString(): string } }[],
  material: { quantity: { toString(): string }; unitPrice: { toString(): string } | null }[],
): number {
  const zaPraci = prace.reduce((s, p) => s + cenaPrace(p.minutes, naHalere(p.hourlyRate)), 0);
  const zaMaterial = material.reduce(
    (s, m) =>
      s + (m.unitPrice === null ? 0 : cenaMaterialu(m.quantity.toString(), naHalere(m.unitPrice))),
    0,
  );
  return zaPraci + zaMaterial;
}
