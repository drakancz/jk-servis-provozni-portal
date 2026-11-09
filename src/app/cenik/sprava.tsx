"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { doPole, korun } from "@/lib/ceny";
import { JEDNOTKY } from "@/lib/vykaz-pravidla";

import { SmazaniSPotvrzenim } from "../potvrzeni";
import { HLAVNI, KARTA, POLE, TLACITKO } from "../styly";
import { pridejPolozku, smazPolozku, upravPolozku, zmenSazbu } from "./akce";

/*
 * Obrazovka Ceník (krok 4A): hodinová sazba a materiál. Tlačítka vidí jen
 * Majitel — je to pohodlí, roli hlídají akce na serveru.
 */

type Polozka = { id: string; nazev: string; jednotka: string; cena: number };
type Odpoved = { ok: true } | { ok: false; chyba: string };

function Formular({
  nadpis,
  tlacitko,
  odeslat,
  zavrit,
  children,
}: {
  nadpis: string;
  tlacitko: string;
  odeslat: (data: FormData) => Promise<Odpoved>;
  zavrit?: (ulozeno: boolean) => void;
  children: ReactNode;
}) {
  const [chyba, setChyba] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);

  async function odeslatFormular(udalost: FormEvent<HTMLFormElement>) {
    udalost.preventDefault();
    const formular = udalost.currentTarget;
    setChyba(null);
    setOdesila(true);
    const odpoved = await odeslat(new FormData(formular));
    setOdesila(false);
    if (!odpoved.ok) return setChyba(odpoved.chyba);
    if (zavrit) zavrit(true);
  }

  return (
    <form
      onSubmit={odeslatFormular}
      aria-label={nadpis}
      className="mt-3 grid gap-4 rounded-md border border-okraj bg-pozadi p-3 sm:grid-cols-2 sm:p-4"
    >
      {children}
      {chyba && (
        <p role="alert" className="font-medium text-chyba sm:col-span-2">
          {chyba}
        </p>
      )}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={odesila} className={`${HLAVNI} grow sm:grow-0`}>
          {odesila ? "Ukládám…" : tlacitko}
        </button>
        {zavrit && (
          <button type="button" onClick={() => zavrit(false)} className={TLACITKO}>
            Zrušit
          </button>
        )}
      </div>
    </form>
  );
}

function hodnoty(data: FormData, klice: string[]) {
  return Object.fromEntries(klice.map((k) => [k, String(data.get(k) ?? "")]));
}

function PoleCeny({
  nazev,
  popisek,
  puvodni,
}: {
  nazev: string;
  popisek: string;
  puvodni?: number;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="font-medium">{popisek}</span>
      <input
        name={nazev}
        required
        inputMode="decimal"
        maxLength={12}
        autoComplete="off"
        defaultValue={puvodni === undefined ? "" : doPole(puvodni)}
        className={POLE}
      />
    </label>
  );
}

function FormularPolozky({
  puvodni,
  zavrit,
}: {
  puvodni?: Polozka;
  zavrit: (ulozeno: boolean) => void;
}) {
  return (
    <Formular
      nadpis={puvodni ? "Upravit položku ceníku" : "Přidat materiál do ceníku"}
      tlacitko={puvodni ? "Uložit změny" : "Přidat do ceníku"}
      zavrit={zavrit}
      odeslat={(data) => {
        const udaje = hodnoty(data, ["nazev", "jednotka", "cena"]);
        return puvodni ? upravPolozku(puvodni.id, udaje) : pridejPolozku(udaje);
      }}
    >
      <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <span className="font-medium">Název materiálu</span>
        <input
          name="nazev"
          required
          minLength={2}
          maxLength={120}
          autoComplete="off"
          defaultValue={puvodni?.nazev ?? ""}
          className={POLE}
        />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
        <PoleCeny nazev="cena" popisek="Cena za jednotku (Kč bez DPH)" puvodni={puvodni?.cena} />
        <label className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">Jednotka</span>
          <select name="jednotka" defaultValue={puvodni?.jednotka ?? "ks"} className={POLE}>
            {JEDNOTKY.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Formular>
  );
}

export function SpravaCeniku({
  sazba,
  polozky,
  smiMenit,
}: {
  sazba: number;
  polozky: Polozka[];
  smiMenit: boolean;
}) {
  const [otevreno, setOtevreno] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);

  function zavrit(hlaska: string) {
    return (ulozeno: boolean) => {
      setOtevreno(null);
      setZprava(ulozeno ? hlaska : null);
    };
  }
  function otevrit(co: string) {
    setZprava(null);
    setOtevreno(co);
  }

  return (
    <>
      {zprava && (
        <p role="status" className="font-medium">
          {zprava}
        </p>
      )}
      <section aria-labelledby="sazba" className={KARTA}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="sazba" className="text-xl font-bold">
            Práce
          </h2>
          <p>
            Hodinová sazba: <strong>{korun(sazba)}</strong> bez DPH
          </p>
        </div>
        {smiMenit &&
          (otevreno === "sazba" ? (
            <Formular
              nadpis="Změnit hodinovou sazbu"
              tlacitko="Uložit sazbu"
              zavrit={zavrit("Hodinová sazba uložena.")}
              odeslat={(data) => zmenSazbu(hodnoty(data, ["sazba"]))}
            >
              <PoleCeny nazev="sazba" popisek="Hodinová sazba (Kč bez DPH)" puvodni={sazba} />
            </Formular>
          ) : (
            <button
              type="button"
              onClick={() => otevrit("sazba")}
              className={`${TLACITKO} mt-3 w-full sm:w-auto`}
            >
              Změnit sazbu
            </button>
          ))}
      </section>

      <section aria-labelledby="material" className={KARTA}>
        <h2 id="material" className="text-xl font-bold">
          Materiál
        </h2>
        {polozky.length === 0 ? (
          <p className="mt-2 text-text-tlumeny">Ceník materiálu je zatím prázdný.</p>
        ) : (
          <ul aria-label="Ceník materiálu" className="mt-3 flex flex-col divide-y divide-okraj">
            {polozky.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{p.nazev}</p>
                    <p className="text-text-tlumeny">
                      {korun(p.cena)} / {p.jednotka}
                    </p>
                  </div>
                  {smiMenit && otevreno !== `polozka-${p.id}` && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => otevrit(`polozka-${p.id}`)}
                        className={TLACITKO}
                      >
                        Upravit
                      </button>
                      <SmazaniSPotvrzenim
                        id={p.id}
                        tlacitko="Smazat"
                        nadpis={`Smazat z ceníku: ${p.nazev}?`}
                        potvrdit="Ano, smazat z ceníku"
                        akce={() => smazPolozku(p.id)}
                        po="/cenik"
                      >
                        <p>Materiál zmizí z ceníku a technici ho už nevyberou.</p>
                        <p>Zakázky, kde už je zapsaný, si jeho cenu nechají.</p>
                      </SmazaniSPotvrzenim>
                    </div>
                  )}
                </div>
                {otevreno === `polozka-${p.id}` && (
                  <FormularPolozky puvodni={p} zavrit={zavrit("Položka ceníku upravena.")} />
                )}
              </li>
            ))}
          </ul>
        )}
        {smiMenit &&
          (otevreno === "nova-polozka" ? (
            <FormularPolozky zavrit={zavrit("Materiál přidán do ceníku.")} />
          ) : (
            <button
              type="button"
              onClick={() => otevrit("nova-polozka")}
              className={`${TLACITKO} mt-3 w-full sm:w-auto`}
            >
              Přidat materiál
            </button>
          ))}
        {!smiMenit && <p className="mt-3 text-text-tlumeny">Ceník upravuje majitel.</p>}
      </section>
    </>
  );
}
