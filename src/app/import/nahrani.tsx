"use client";

import { useState, type FormEvent } from "react";

import type { Tabulka } from "@/lib/import-excel";
import {
  LIMITY,
  navrhniPrirazeni,
  pismenoSloupce,
  POLE_IMPORTU,
  radku,
  type PoleImportu,
  type Prirazeni,
} from "@/lib/import-pole";

import { HLAVNI, KARTA, POLE } from "../styly";
import { nactiExcel } from "./akce";
import { Kontrola } from "./kontrola";

/*
 * Nahrání tabulky, přiřazení sloupců a náhled (krok 3A). Soubor zůstává
 * jen v okně prohlížeče; server ho přečte a nic neuloží. Kontroly jsou na
 * serveru (src/lib/import-excel.ts), tady jen pohodlí.
 */

const NAHLED = 10;

export function Nahrani() {
  const [soubor, setSoubor] = useState<File | null>(null);
  const [tabulka, setTabulka] = useState<Tabulka | null>(null);
  const [prirazeni, setPrirazeni] = useState<Prirazeni | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacita, setNacita] = useState(false);
  // Každé načtení tabulky zahodí předchozí kontrolu (klíč komponenty).
  const [verze, setVerze] = useState(0);

  async function nacist(vybrany: File, list: string | null) {
    setChyba(null);
    if (vybrany.size > LIMITY.velikost) {
      setChyba("Soubor je větší než 2 MB.");
      return;
    }
    const data = new FormData();
    data.set("soubor", vybrany);
    if (list) data.set("list", list);
    setNacita(true);
    try {
      const odpoved = await nactiExcel(data);
      if (!odpoved.ok) {
        setChyba(odpoved.chyba);
        return;
      }
      setTabulka(odpoved.tabulka);
      setPrirazeni(navrhniPrirazeni(odpoved.tabulka.zahlavi));
      setVerze((v) => v + 1);
    } catch {
      setChyba("Soubor se nepodařilo odeslat. Zkuste to znovu, případně s menším souborem.");
    } finally {
      setNacita(false);
    }
  }

  function odeslat(udalost: FormEvent<HTMLFormElement>) {
    udalost.preventDefault();
    if (!soubor) {
      setChyba("Vyberte soubor.");
      return;
    }
    setTabulka(null);
    setPrirazeni(null);
    void nacist(soubor, null);
  }

  return (
    <>
      <section aria-labelledby="soubor" className={KARTA}>
        <h2 id="soubor" className="text-xl font-bold">
          1. Soubor
        </h2>
        <p className="mt-1 text-text-tlumeny">
          Tabulka .xlsx do 2 MB a {LIMITY.radku} řádků, v prvním řádku názvy sloupců. Soubor se
          nikam neukládá — portál ho jen přečte.{" "}
          <a href="/import/vzor" download className="font-medium text-hlavni underline">
            Stáhnout vzorový soubor
          </a>
        </p>
        <form onSubmit={odeslat} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
            <span className="font-medium">Tabulka Excelu</span>
            <input
              name="soubor"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setSoubor(e.target.files?.[0] ?? null);
                setChyba(null);
              }}
              className={POLE}
            />
          </label>
          <button type="submit" disabled={nacita} className={HLAVNI}>
            {nacita ? "Načítám…" : "Načíst tabulku"}
          </button>
        </form>
        {chyba && (
          <p role="alert" className="mt-3 font-medium text-chyba">
            {chyba}
          </p>
        )}
        {tabulka && soubor && tabulka.listy.length > 1 && (
          <div className="mt-4 flex max-w-sm flex-col gap-1">
            <label htmlFor="list-sesitu" className="font-medium">
              List sešitu
            </label>
            <select
              id="list-sesitu"
              value={tabulka.list}
              disabled={nacita}
              onChange={(e) => void nacist(soubor, e.target.value)}
              className={POLE}
            >
              {tabulka.listy.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        {tabulka && (
          <p role="status" className="mt-3 font-medium">
            Načteno {tabulka.radky.length} {radku(tabulka.radky.length)} z listu „{tabulka.list}“.
          </p>
        )}
      </section>

      {tabulka && prirazeni && (
        <>
          <PrirazeniANahled tabulka={tabulka} prirazeni={prirazeni} zmenit={setPrirazeni} />
          {soubor && (
            <Kontrola
              key={`${verze}-${JSON.stringify(prirazeni)}`}
              soubor={soubor}
              list={tabulka.list}
              prirazeni={prirazeni}
            />
          )}
        </>
      )}
    </>
  );
}

function PrirazeniANahled({
  tabulka,
  prirazeni,
  zmenit,
}: {
  tabulka: Tabulka;
  prirazeni: Prirazeni;
  zmenit: (p: Prirazeni) => void;
}) {
  const pouzita = POLE_IMPORTU.filter((p) => prirazeni[p.id] !== null);
  const chybi = POLE_IMPORTU.filter((p) => p.povinne && prirazeni[p.id] === null);

  function nastav(pole: PoleImportu, hodnota: string) {
    const index = hodnota === "" ? null : Number(hodnota);
    // Jeden sloupec patří nejvýš jednomu údaji — jinde se uvolní.
    const novy = { ...prirazeni };
    if (index !== null) {
      for (const p of POLE_IMPORTU) if (novy[p.id] === index) novy[p.id] = null;
    }
    novy[pole] = index;
    zmenit(novy);
  }

  return (
    <>
      <section aria-labelledby="prirazeni" className={KARTA}>
        <h2 id="prirazeni" className="text-xl font-bold">
          2. Přiřazení sloupců
        </h2>
        <p className="mt-1 text-text-tlumeny">
          Portál přiřazení navrhl podle názvů sloupců. Zkontrolujte ho a případně opravte.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {POLE_IMPORTU.map((p) => (
            // Popisek přes htmlFor, ne obalením — jinak by se do názvu
            // výběru počítaly i všechny nabídky.
            <div key={p.id} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`pole-${p.id}`} className="font-medium">
                {p.nazev}
                {p.povinne && <span className="text-text-tlumeny"> (povinné)</span>}
              </label>
              <select
                id={`pole-${p.id}`}
                value={prirazeni[p.id] ?? ""}
                onChange={(e) => nastav(p.id, e.target.value)}
                className={POLE}
              >
                <option value="">— nepoužít —</option>
                {tabulka.zahlavi.map((z, i) => (
                  <option key={i} value={i}>
                    {pismenoSloupce(i)}: {z}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {chybi.length > 0 && (
          <p className="mt-4 font-medium text-chyba">
            Přiřaďte povinné údaje: {chybi.map((p) => p.nazev).join(", ")}.
          </p>
        )}
      </section>

      <section aria-labelledby="nahled" className={KARTA}>
        <h2 id="nahled" className="text-xl font-bold">
          3. Náhled
        </h2>
        <p className="mt-1 text-text-tlumeny">
          {tabulka.radky.length > NAHLED
            ? `Prvních ${NAHLED} řádků z ${tabulka.radky.length}`
            : `Všechny řádky (${tabulka.radky.length})`}{" "}
          tak, jak je portál uvidí.
        </p>
        {pouzita.length === 0 ? (
          <p className="mt-3">Zatím není přiřazený žádný sloupec.</p>
        ) : (
          <div
            role="region"
            aria-label="Náhled tabulky"
            tabIndex={0}
            className="mt-4 max-w-full overflow-x-auto rounded-md border border-okraj"
          >
            <table className="w-full text-left text-sm">
              <thead className="bg-pozadi">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Řádek
                  </th>
                  {pouzita.map((p) => (
                    <th
                      key={p.id}
                      scope="col"
                      className="px-3 py-2 font-semibold whitespace-nowrap"
                    >
                      {p.nazev}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-okraj">
                {tabulka.radky.slice(0, NAHLED).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-text-tlumeny">{tabulka.cisla[i]}</td>
                    {pouzita.map((p) => (
                      <td key={p.id} className="max-w-64 px-3 py-2 break-words">
                        {r[prirazeni[p.id]!] || <span className="text-text-tlumeny">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
