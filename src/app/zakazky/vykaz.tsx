"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { doPole, DPH_PROCENT, korun } from "@/lib/ceny";
import { delka, denCesky, JEDNOTKY, MNOZSTVI } from "@/lib/vykaz-pravidla";

import { SmazaniSPotvrzenim } from "../potvrzeni";
import { HLAVNI, KARTA, POLE, TLACITKO } from "../styly";
import {
  pridejMaterial,
  pridejPraci,
  smazMaterial,
  smazPraci,
  upravMaterial,
  upravPraci,
} from "./akce-vykaz";

/*
 * Výkaz zakázky (krok 2C): práce a materiál. Technik ho vyplňuje hlavně
 * na telefonu — velká pole, jeden otevřený formulář najednou. Tlačítka
 * jsou pohodlí; co kdo smí, hlídá akce na serveru (src/lib/vykaz.ts).
 */

type Prace = {
  id: string;
  den: string;
  minut: number;
  poznamka: string;
  zapsal: string;
  smiMenit: boolean;
  /** Ceny (v haléřích) jen pro Majitele a Dispečera. */
  sazba?: number;
  cena?: number;
};
type Material = {
  id: string;
  nazev: string;
  mnozstvi: string;
  jednotka: string;
  polozkaId: string | null;
  zapsal: string;
  smiMenit: boolean;
  cenaJednotky?: number | null;
  cena?: number | null;
};
type SouhrnCen = {
  zaPraci: number;
  zaMaterial: number;
  bezDph: number;
  dph: number;
  sDph: number;
  chybiCena: number;
};
export type DataVykazu = {
  smiPsat: boolean;
  celkemMinut: number;
  prace: Prace[];
  material: Material[];
  /** Null = ten, kdo se dívá, ceny nevidí (Technik). */
  ceny: SouhrnCen | null;
};
/** Položka ceníku do výběru; cena jen pro toho, kdo ceny vidí. */
export type PolozkaKVyberu = { id: string; nazev: string; jednotka: string; cena?: number };

type Odpoved = { ok: true } | { ok: false; chyba: string };

/** Společná kostra formuláře: odeslání, hláška chyby, Uložit a Zrušit. */
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
  zavrit: (ulozeno: boolean) => void;
  children: ReactNode;
}) {
  const [chyba, setChyba] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);

  async function odeslatFormular(udalost: FormEvent<HTMLFormElement>) {
    udalost.preventDefault();
    setChyba(null);
    setOdesila(true);
    const odpoved = await odeslat(new FormData(udalost.currentTarget));
    setOdesila(false);
    if (odpoved.ok) zavrit(true);
    else setChyba(odpoved.chyba);
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
        <button type="button" onClick={() => zavrit(false)} className={TLACITKO}>
          Zrušit
        </button>
      </div>
    </form>
  );
}

function hodnoty(data: FormData, klice: string[]) {
  return Object.fromEntries(klice.map((k) => [k, String(data.get(k) ?? "")]));
}

function FormularPrace({
  zakazkaId,
  puvodni,
  dnes,
  zavrit,
}: {
  zakazkaId: string;
  puvodni?: Prace;
  dnes: string;
  zavrit: (ulozeno: boolean) => void;
}) {
  return (
    <Formular
      nadpis={puvodni ? "Upravit práci" : "Zapsat práci"}
      tlacitko={puvodni ? "Uložit změny" : "Uložit práci"}
      zavrit={zavrit}
      odeslat={(data) => {
        const udaje = hodnoty(data, ["den", "hodiny", "minuty", "poznamka"]);
        return puvodni ? upravPraci(puvodni.id, udaje) : pridejPraci(zakazkaId, udaje);
      }}
    >
      <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <span className="font-medium">Den</span>
        <input
          name="den"
          type="date"
          required
          max={dnes}
          defaultValue={puvodni?.den ?? dnes}
          className={POLE}
        />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">Hodin</span>
          <input
            name="hodiny"
            type="number"
            inputMode="numeric"
            min={0}
            max={24}
            defaultValue={puvodni ? Math.floor(puvodni.minut / 60) : ""}
            className={POLE}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">Minut</span>
          <input
            name="minuty"
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            defaultValue={puvodni ? puvodni.minut % 60 : ""}
            className={POLE}
          />
        </label>
      </div>
      <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <span className="font-medium">Co se dělalo</span>
        <textarea
          name="poznamka"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          defaultValue={puvodni?.poznamka ?? ""}
          className={POLE}
        />
      </label>
    </Formular>
  );
}

function FormularMaterialu({
  zakazkaId,
  puvodni,
  polozky,
  vidiCeny,
  zavrit,
}: {
  zakazkaId: string;
  puvodni?: Material;
  polozky: PolozkaKVyberu[];
  vidiCeny: boolean;
  zavrit: (ulozeno: boolean) => void;
}) {
  const [polozkaId, setPolozkaId] = useState(puvodni?.polozkaId ?? "");
  // Popisek přes `htmlFor`, ne obalením — jinak by se do názvu pole
  // počítaly i texty všech položek výběru.
  const idVyberu = useId();
  // Řádek z položky, která mezitím z ceníku zmizela: nabídnout ji dál, ať
  // úprava množství nesmaže cenu ze dne zápisu.
  const nabidka =
    puvodni?.polozkaId && !polozky.some((p) => p.id === puvodni.polozkaId)
      ? [...polozky, { id: puvodni.polozkaId, nazev: puvodni.nazev, jednotka: puvodni.jednotka }]
      : polozky;
  const vybrana = nabidka.find((p) => p.id === polozkaId);

  return (
    <Formular
      nadpis={puvodni ? "Upravit materiál" : "Zapsat materiál"}
      tlacitko={puvodni ? "Uložit změny" : "Uložit materiál"}
      zavrit={zavrit}
      odeslat={(data) => {
        const udaje = hodnoty(data, ["polozkaId", "nazev", "mnozstvi", "jednotka", "cena"]);
        return puvodni ? upravMaterial(puvodni.id, udaje) : pridejMaterial(zakazkaId, udaje);
      }}
    >
      {nabidka.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <label htmlFor={idVyberu} className="font-medium">
            Z ceníku
          </label>
          <select
            id={idVyberu}
            name="polozkaId"
            value={polozkaId}
            onChange={(e) => setPolozkaId(e.target.value)}
            className={POLE}
          >
            <option value="">Jiný materiál (zapsat ručně)</option>
            {nabidka.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nazev} ({p.jednotka}){p.cena !== undefined ? ` · ${korun(p.cena)}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {!vybrana && (
        <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <span className="font-medium">Materiál</span>
          <input
            name="nazev"
            required
            minLength={2}
            maxLength={120}
            autoComplete="off"
            defaultValue={puvodni && !puvodni.polozkaId ? puvodni.nazev : ""}
            className={POLE}
          />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">Množství{vybrana ? ` (${vybrana.jednotka})` : ""}</span>
          <input
            name="mnozstvi"
            required
            inputMode="decimal"
            maxLength={12}
            autoComplete="off"
            defaultValue={puvodni ? puvodni.mnozstvi.replace(".", ",") : ""}
            className={POLE}
          />
        </label>
        {!vybrana && (
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
        )}
      </div>
      {!vybrana && vidiCeny && (
        <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <span className="font-medium">Cena za jednotku v Kč bez DPH (nepovinné)</span>
          <input
            name="cena"
            inputMode="decimal"
            maxLength={12}
            autoComplete="off"
            defaultValue={
              puvodni && !puvodni.polozkaId && puvodni.cenaJednotky != null
                ? doPole(puvodni.cenaJednotky)
                : ""
            }
            className={POLE}
          />
        </label>
      )}
    </Formular>
  );
}

/** Cena zakázky z výkazu (jen Majitel a Dispečer). */
function CenaZakazky({ ceny }: { ceny: SouhrnCen }) {
  return (
    <div className="mt-6 border-t border-okraj pt-4">
      <h3 className="font-semibold">Cena zakázky</h3>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
        <dt>Práce</dt>
        <dd className="text-right tabular-nums">{korun(ceny.zaPraci)}</dd>
        <dt>Materiál</dt>
        <dd className="text-right tabular-nums">{korun(ceny.zaMaterial)}</dd>
        <dt className="font-semibold">Celkem bez DPH</dt>
        <dd className="text-right font-semibold tabular-nums">{korun(ceny.bezDph)}</dd>
        <dt>DPH {DPH_PROCENT} %</dt>
        <dd className="text-right tabular-nums">{korun(ceny.dph)}</dd>
        <dt className="font-bold">Celkem s DPH</dt>
        <dd className="text-right font-bold tabular-nums">{korun(ceny.sDph)}</dd>
      </dl>
      {ceny.chybiCena > 0 && (
        <p className="mt-2 font-medium text-chyba">
          {ceny.chybiCena === 1
            ? "U 1 položky materiálu chybí cena"
            : `U ${ceny.chybiCena} položek materiálu chybí cena`}{" "}
          — doplníte ji úpravou řádku.
        </p>
      )}
    </div>
  );
}

/** Řádek seznamu s tlačítky Upravit a Smazat (když je smí měnit). */
function Radek({
  hlavni,
  popis,
  zapsal,
  smiMenit,
  upravit,
  smazani,
  formular,
}: {
  hlavni: string;
  popis?: string;
  zapsal: string;
  smiMenit: boolean;
  upravit: () => void;
  smazani: ReactNode;
  formular: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">{hlavni}</p>
          {popis && <p className="break-words whitespace-pre-line">{popis}</p>}
          <p className="text-sm text-text-tlumeny">Zapsáno: {zapsal}</p>
        </div>
        {smiMenit && !formular && (
          <div className="flex gap-2">
            <button type="button" onClick={upravit} className={TLACITKO}>
              Upravit
            </button>
            {smazani}
          </div>
        )}
      </div>
      {formular}
    </li>
  );
}

export function Vykaz({
  zakazkaId,
  data,
  dnes,
  zamceno,
  polozky,
}: {
  zakazkaId: string;
  data: DataVykazu;
  dnes: string;
  /** Položky ceníku k výběru u materiálu (krok 4A). */
  polozky: PolozkaKVyberu[];
  /** Proč výkaz nejde měnit (když nejde). */
  zamceno: string | null;
}) {
  // Najednou je otevřený jen jeden formulář (popisky polí se neopakují).
  const [otevreno, setOtevreno] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const adresa = `/zakazky/${zakazkaId}`;

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
    <section aria-labelledby="vykaz" className={KARTA}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="vykaz" className="text-xl font-bold">
          Výkaz
        </h2>
        <p>
          Odpracováno celkem: <strong>{delka(data.celkemMinut)}</strong>
        </p>
      </div>
      {zamceno && <p className="mt-2 text-text-tlumeny">{zamceno}</p>}
      {zprava && (
        <p role="status" className="mt-2 font-medium">
          {zprava}
        </p>
      )}

      <h3 className="mt-4 font-semibold">Práce</h3>
      {data.prace.length === 0 ? (
        <p className="mt-1 text-text-tlumeny">Zatím není zapsaná žádná práce.</p>
      ) : (
        <ul aria-label="Práce" className="mt-2 flex flex-col divide-y divide-okraj">
          {data.prace.map((p) => (
            <Radek
              key={p.id}
              hlavni={`${denCesky(p.den)} · ${delka(p.minut)}${p.cena !== undefined ? ` · ${korun(p.cena)}` : ""}`}
              popis={p.poznamka}
              zapsal={p.zapsal}
              smiMenit={p.smiMenit}
              upravit={() => otevrit(`prace-${p.id}`)}
              smazani={
                <SmazaniSPotvrzenim
                  id={p.id}
                  tlacitko="Smazat"
                  nadpis={`Smazat práci ze dne ${denCesky(p.den)} (${delka(p.minut)})?`}
                  potvrdit="Ano, smazat práci"
                  akce={() => smazPraci(p.id)}
                  po={adresa}
                >
                  <p>Řádek zmizí z výkazu a odpracovaný čas se odečte.</p>
                  <p>Hotová zakázka musí mít zapsanou aspoň jednu práci — poslední smazat nejde.</p>
                </SmazaniSPotvrzenim>
              }
              formular={
                otevreno === `prace-${p.id}` && (
                  <FormularPrace
                    zakazkaId={zakazkaId}
                    puvodni={p}
                    dnes={dnes}
                    zavrit={zavrit("Práce upravena.")}
                  />
                )
              }
            />
          ))}
        </ul>
      )}
      {data.smiPsat &&
        (otevreno === "nova-prace" ? (
          <FormularPrace zakazkaId={zakazkaId} dnes={dnes} zavrit={zavrit("Práce zapsána.")} />
        ) : (
          <button
            type="button"
            onClick={() => otevrit("nova-prace")}
            className={`${TLACITKO} mt-3 w-full sm:w-auto`}
          >
            Zapsat práci
          </button>
        ))}

      <h3 className="mt-6 font-semibold">Materiál</h3>
      {data.material.length === 0 ? (
        <p className="mt-1 text-text-tlumeny">Zatím není zapsaný žádný materiál.</p>
      ) : (
        <ul aria-label="Materiál" className="mt-2 flex flex-col divide-y divide-okraj">
          {data.material.map((m) => (
            <Radek
              key={m.id}
              hlavni={`${m.nazev} · ${MNOZSTVI.format(Number(m.mnozstvi))} ${m.jednotka}${
                m.cena === undefined
                  ? ""
                  : m.cena === null
                    ? " · cena chybí"
                    : ` · ${korun(m.cena)}`
              }`}
              zapsal={m.zapsal}
              smiMenit={m.smiMenit}
              upravit={() => otevrit(`material-${m.id}`)}
              smazani={
                <SmazaniSPotvrzenim
                  id={m.id}
                  tlacitko="Smazat"
                  nadpis={`Smazat materiál: ${m.nazev}?`}
                  potvrdit="Ano, smazat materiál"
                  akce={() => smazMaterial(m.id)}
                  po={adresa}
                >
                  <p>Řádek zmizí z výkazu zakázky.</p>
                </SmazaniSPotvrzenim>
              }
              formular={
                otevreno === `material-${m.id}` && (
                  <FormularMaterialu
                    zakazkaId={zakazkaId}
                    puvodni={m}
                    polozky={polozky}
                    vidiCeny={data.ceny !== null}
                    zavrit={zavrit("Materiál upraven.")}
                  />
                )
              }
            />
          ))}
        </ul>
      )}
      {data.smiPsat &&
        (otevreno === "novy-material" ? (
          <FormularMaterialu
            zakazkaId={zakazkaId}
            polozky={polozky}
            vidiCeny={data.ceny !== null}
            zavrit={zavrit("Materiál zapsán.")}
          />
        ) : (
          <button
            type="button"
            onClick={() => otevrit("novy-material")}
            className={`${TLACITKO} mt-3 w-full sm:w-auto`}
          >
            Zapsat materiál
          </button>
        ))}

      {data.ceny && <CenaZakazky ceny={data.ceny} />}
    </section>
  );
}
