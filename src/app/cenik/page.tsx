import type { Metadata } from "next";

import { nactiCenik } from "@/lib/cenik";
import { DPH_PROCENT } from "@/lib/ceny";
import { vyzadujRoli } from "@/lib/sezeni";

import { Stranka } from "../stranka";
import { SpravaCeniku } from "./sprava";

export const metadata: Metadata = { title: "Ceník" };
export const dynamic = "force-dynamic";

/**
 * Ceník (krok 4A). Oprávnění (Jakub, 9. 11. 2026):
 * - **vidí Majitel a Dispečer**, **mění jen Majitel** (hodinovou sazbu
 *   i materiál), Dispečer ho má jen ke čtení,
 * - **Technik dostane 404** — ceny nevidí vůbec,
 * - nepřihlášený jde na přihlášení.
 * Akce si roli ověřují samy (`src/app/cenik/akce.ts`).
 */
export default async function Cenik() {
  const uzivatel = await vyzadujRoli("MAJITEL", "DISPECER");
  const cenik = await nactiCenik();
  return (
    <Stranka
      uzivatel={uzivatel}
      aktivni="cenik"
      nadpis="Ceník"
      popis={`Ceny jsou bez DPH (u zakázky se připočte ${DPH_PROCENT} %). Změna ceníku platí pro nově zapsanou práci a materiál — už zapsané řádky si cenu nechají.`}
    >
      <SpravaCeniku
        sazba={cenik.sazba}
        polozky={cenik.polozky}
        smiMenit={uzivatel.role === "MAJITEL"}
      />
    </Stranka>
  );
}
