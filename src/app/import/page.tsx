import type { Metadata } from "next";

import { vyzadujRoli } from "@/lib/sezeni";

import { Stranka } from "../stranka";
import { Nahrani } from "./nahrani";

export const metadata: Metadata = { title: "Import z Excelu" };
export const dynamic = "force-dynamic";

/**
 * Import z Excelu (krok 3A). Oprávnění (Jakub, 8. 11. 2026):
 * - vidí a používá **Majitel a Dispečer** (jako zakládání zakázek),
 * - **Technik dostane 404**, nepřihlášený jde na přihlášení.
 * Soubor se nikam neukládá; přiřazení sloupců a náhled běží v okně.
 */
export default async function StrankaImportu() {
  const uzivatel = await vyzadujRoli("MAJITEL", "DISPECER");
  return (
    <Stranka
      uzivatel={uzivatel}
      aktivni="import"
      nadpis="Import z Excelu"
      popis="Nahrajte vlastní tabulku zakázek (.xlsx), přiřaďte sloupce a podívejte se, jak je portál uvidí."
    >
      <Nahrani />
    </Stranka>
  );
}
