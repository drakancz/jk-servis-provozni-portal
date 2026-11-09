"use client";

import Link from "next/link";
import { useState } from "react";

import type { KontrolaRadku, VysledekKontroly } from "@/lib/import-kontrola";
import { POLE_IMPORTU, radku, tvar, type Prirazeni } from "@/lib/import-pole";

import { HLAVNI, KARTA } from "../styly";
import { ulozImport, zkontrolujImport } from "./akce";

/*
 * Kontrola řádků a uložení (krok 3B). Rozhodnutí Jakuba (8. 11. 2026):
 * uloží se jen bezchybné řádky, chybné zůstanou vypsané s číslem řádku
 * v Excelu. Server soubor při kontrole i uložení čte znovu a uložení
 * kontroluje ještě jednou — tohle okno je jen pohodlí. Změna přiřazení
 * nebo nová tabulka komponentu založí znovu (klíč), takže stará kontrola
 * nezůstane viset.
 */

type Kontrolovano = { radky: KontrolaRadku[]; souhrn: VysledekKontroly["souhrn"] };
type Ulozeno = { zakazek: number; zakazniku: number; preskoceno: number };

export function Kontrola({
  soubor,
  list,
  prirazeni,
}: {
  soubor: File;
  list: string;
  prirazeni: Prirazeni;
}) {
  const [kontrola, setKontrola] = useState<Kontrolovano | null>(null);
  const [ulozeno, setUlozeno] = useState<Ulozeno | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState<"kontrola" | "ulozeni" | null>(null);
  const chybi = POLE_IMPORTU.some((p) => p.povinne && prirazeni[p.id] === null);

  function data() {
    const d = new FormData();
    d.set("soubor", soubor);
    d.set("list", list);
    d.set("prirazeni", JSON.stringify(prirazeni));
    return d;
  }

  async function zkontrolovat() {
    setChyba(null);
    setPracuje("kontrola");
    try {
      const odpoved = await zkontrolujImport(data());
      if (!odpoved.ok) setChyba(odpoved.chyba);
      else setKontrola({ radky: odpoved.radky, souhrn: odpoved.souhrn });
    } catch {
      setChyba("Kontrola se nepovedla. Zkuste to znovu.");
    } finally {
      setPracuje(null);
    }
  }

  async function ulozit() {
    setChyba(null);
    setPracuje("ulozeni");
    try {
      const odpoved = await ulozImport(data());
      if (!odpoved.ok) setChyba(odpoved.chyba);
      else setUlozeno(odpoved);
    } catch {
      setChyba("Uložení se nepovedlo, nic se nezapsalo. Zkuste to znovu.");
    } finally {
      setPracuje(null);
    }
  }

  return (
    <section aria-labelledby="kontrola" className={KARTA}>
      <h2 id="kontrola" className="text-xl font-bold">
        4. Kontrola a uložení
      </h2>

      {ulozeno ? (
        <div className="mt-3">
          <p role="status" className="font-medium">
            Uloženo: {ulozeno.zakazek} {tvar(ulozeno.zakazek, "zakázka", "zakázky", "zakázek")}.
            {ulozeno.zakazniku > 0 && ` Noví zákazníci: ${ulozeno.zakazniku}.`}
            {ulozeno.preskoceno > 0 &&
              ` Přeskočeno: ${ulozeno.preskoceno} ${radku(ulozeno.preskoceno)} s chybou.`}
          </p>
          <Link href="/" className="mt-2 inline-block font-medium text-hlavni underline">
            Přejít na zakázky
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-1 text-text-tlumeny">
            Portál projde všechny řádky a ukáže, co by uložil. Uloží se jen řádky bez chyb.
          </p>
          {!kontrola && (
            <button
              type="button"
              onClick={() => void zkontrolovat()}
              disabled={chybi || pracuje !== null}
              className={`${HLAVNI} mt-4`}
            >
              {pracuje === "kontrola" ? "Kontroluji…" : "Zkontrolovat řádky"}
            </button>
          )}
          {kontrola && (
            <Vysledek
              kontrola={kontrola}
              pracuje={pracuje === "ulozeni"}
              ulozit={() => void ulozit()}
            />
          )}
        </>
      )}

      {chyba && (
        <p role="alert" className="mt-3 font-medium text-chyba">
          {chyba}
        </p>
      )}
    </section>
  );
}

function Vysledek({
  kontrola,
  pracuje,
  ulozit,
}: {
  kontrola: Kontrolovano;
  pracuje: boolean;
  ulozit: () => void;
}) {
  const { souhrn, radky } = kontrola;
  return (
    <>
      <p role="status" className="mt-4 font-medium">
        Bez chyb: {souhrn.bezChyb} {radku(souhrn.bezChyb)}. S chybou: {souhrn.sChybou}{" "}
        {radku(souhrn.sChybou)}.
        {souhrn.novychZakazniku > 0 && ` Noví zákazníci: ${souhrn.novychZakazniku}.`}
      </p>

      {radky.length > 0 && (
        <div
          role="region"
          aria-label="Chyby a upozornění"
          tabIndex={0}
          className="mt-4 max-h-[28rem] max-w-full overflow-auto rounded-md border border-okraj"
        >
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-pozadi">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Řádek
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Co portál našel
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-okraj">
              {radky.map((r) => (
                <tr key={r.cislo}>
                  <td className="px-3 py-2 align-top text-text-tlumeny">{r.cislo}</td>
                  <td className="px-3 py-2 break-words">
                    <ul className="space-y-1">
                      {r.chyby.map((c) => (
                        <li key={c} className="text-chyba">
                          <span className="font-semibold">Chyba:</span> {c}
                        </li>
                      ))}
                      {r.upozorneni.map((u) => (
                        <li key={u}>
                          <span className="font-semibold">Upozornění:</span> {u}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {souhrn.bezChyb > 0 ? (
        <button type="button" onClick={ulozit} disabled={pracuje} className={`${HLAVNI} mt-4`}>
          {pracuje
            ? "Ukládám…"
            : `Uložit ${souhrn.bezChyb} ${tvar(souhrn.bezChyb, "zakázku", "zakázky", "zakázek")}` +
              (souhrn.sChybou > 0 ? `, ${souhrn.sChybou} ${radku(souhrn.sChybou)} přeskočit` : "")}
        </button>
      ) : (
        <p className="mt-4 font-medium text-chyba">
          Žádný řádek nejde uložit. Opravte tabulku v Excelu a nahrajte ji znovu.
        </p>
      )}
    </>
  );
}
