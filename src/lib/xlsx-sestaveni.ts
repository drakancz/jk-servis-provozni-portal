import { strToU8, zipSync } from "fflate";

// Relativně, ne přes „@/“ — soubor načítají i testy Playwrightu.
import { pismenoSloupce } from "./import-pole";

/**
 * Jednoduchý sešit .xlsx složený v paměti: vzorový soubor importu (3B),
 * export zakázek (3C) a zkušební sešity v testech. Jen to nejnutnější
 * z formátu — text přímo v buňkách (`inlineStr`) a čísla (`<v>`), které
 * Excel i LibreOffice otevřou. Text v `inlineStr` se nikdy nevyhodnocuje
 * jako vzorec, takže „=…“ ve jménu zákazníka v Excelu nic nespustí.
 * Na export to stačí — `write-excel-file` by byl balíček navíc kvůli pár
 * řádkům (krok 3C, 8. 11. 2026).
 */

/** Buňka: text, nebo číslo (Excel s ním pak umí počítat). */
export type Bunka = string | number;

function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function list(radky: Bunka[][], sirka?: number): string {
  const sloupcu = Math.max(0, ...radky.map((r) => r.length));
  const cols =
    sirka && sloupcu > 0
      ? `<cols><col min="1" max="${sloupcu}" width="${sirka}" customWidth="1"/></cols>`
      : "";
  const data = radky
    .map(
      (radek, r) =>
        `<row r="${r + 1}">${radek
          .map((bunka, c) => {
            const adresa = `${pismenoSloupce(c)}${r + 1}`;
            if (typeof bunka === "number") {
              return Number.isFinite(bunka) ? `<c r="${adresa}"><v>${bunka}</v></c>` : "";
            }
            return bunka === ""
              ? ""
              : `<c r="${adresa}" t="inlineStr"><is><t xml:space="preserve">${xml(bunka)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${data}</sheetData></worksheet>`;
}

/** Sešit s listy `{ název: řádky }`; `sirka` = šířka sloupců ve znacích. */
export function slozSesit(listy: Record<string, Bunka[][]>, sirka?: number): Uint8Array {
  const nazvy = Object.keys(listy);
  const soubory: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${nazvy
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nazvy
        .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nazvy
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("")}</Relationships>`,
    ),
  };
  nazvy.forEach((n, i) => {
    soubory[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(list(listy[n], sirka));
  });
  return zipSync(soubory);
}
