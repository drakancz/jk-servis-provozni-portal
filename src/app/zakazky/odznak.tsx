import { NAZEV_STAVU, type Stav } from "@/lib/stavy";

/**
 * Stav zakázky jako štítek. Barvy jen z proměnných; rozlišení nese text,
 * ne barva (přístupnost).
 */
const VZHLED: Record<Stav, string> = {
  NOVA: "border-zvyrazneni text-zvyrazneni",
  PRIDELENA: "border-hlavni text-hlavni",
  V_PRACI: "border-hlavni bg-hlavni text-hlavni-text",
  HOTOVA: "border-okraj text-text",
  VYFAKTUROVANA: "border-okraj text-text-tlumeny",
};

export function OdznakStavu({ stav }: { stav: Stav }) {
  return (
    <span
      data-stav={stav}
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${VZHLED[stav]}`}
    >
      {NAZEV_STAVU[stav]}
    </span>
  );
}
