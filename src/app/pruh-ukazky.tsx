import { jeUkazka } from "@/lib/ukazka";

/**
 * Pruh „Ukázka“ nahoře (krok 5A) — jen s `UKAZKA=1`. Návštěvník má vědět,
 * že data jsou vymyšlená a co udělá, ráno zmizí.
 */
export function PruhUkazky() {
  if (!jeUkazka()) return null;
  return (
    <aside
      aria-label="Ukázka"
      className="border-b border-okraj bg-hlavni px-4 py-2 text-center text-sm font-medium text-hlavni-text"
    >
      Ukázka s vymyšlenými daty — zkoušejte cokoli, každý den se vše vrátí do výchozího stavu.
    </aside>
  );
}
