import { zipSync } from "fflate";

import { slozSesit } from "../src/lib/xlsx-sestaveni";

/**
 * Zkušební sešity .xlsx pro testy importu — skládají se v paměti, ať
 * v repozitáři nejsou binární soubory. Skládá je stejná funkce jako
 * vzorový soubor ke stažení (src/lib/xlsx-sestaveni.ts).
 */

/** Sešit s listy `{ název: řádky }` jako Buffer pro `setInputFiles`. */
export function sesit(listy: Record<string, string[][]>): Buffer {
  return Buffer.from(slozSesit(listy));
}

/**
 * „Zip bomba“: platný archiv, který je malý, ale po rozbalení má víc než
 * 50 MB (samé nuly se zhustí zhruba tisíckrát).
 */
export function zipBomba(): Buffer {
  return Buffer.from(
    zipSync({ "xl/worksheets/sheet1.xml": new Uint8Array(60 * 1024 * 1024) }, { level: 9 }),
  );
}
