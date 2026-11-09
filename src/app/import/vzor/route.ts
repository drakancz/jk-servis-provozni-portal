import { POLE_IMPORTU } from "@/lib/import-pole";
import { prihlaseny } from "@/lib/sezeni";
import { slozSesit } from "@/lib/xlsx-sestaveni";

/**
 * Vzorový soubor importu (krok 3B). Oprávnění (Jakub, 8. 11. 2026): stáhne
 * ho **Majitel a Dispečer** (jako celý import). Nepřihlášený dostane 401,
 * Technik 404. Obsah je vymyšlený — správné názvy sloupců a dva řádky.
 */
export const dynamic = "force-dynamic";

const UKAZKA = [
  [
    "Instalatérství Novák s.r.o.",
    "777 123 456",
    "info@novak.example",
    "Hlavní 12, Liberec",
    "Kape kohoutek v kuchyni",
    "20. 11. 2026",
    "Nová",
    "",
  ],
  [
    "Pekárna U Mlýna",
    "",
    "",
    "Mlýnská 4, Turnov",
    "Nejde pec, zkontrolovat termostat",
    "25. 11. 2026",
    "Přidělená",
    "Tomáš Beneš",
  ],
];

export async function GET() {
  const kdo = await prihlaseny();
  if (!kdo) return new Response("Nepřihlášeno.", { status: 401 });
  if (kdo.role !== "MAJITEL" && kdo.role !== "DISPECER") {
    return new Response("Nenalezeno.", { status: 404 });
  }
  const sesit = slozSesit({ Zakázky: [POLE_IMPORTU.map((p) => p.nazev), ...UKAZKA] }, 28);
  return new Response(Buffer.from(sesit), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="vzor-importu.xlsx"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
