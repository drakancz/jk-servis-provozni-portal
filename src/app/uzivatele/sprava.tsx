"use client";

import { useRef, useState, type FormEvent } from "react";

import { DATUM_CAS, NAZEV_ROLE, ROLE, type Role } from "@/lib/role";

import { novyOdkaz, zalozUzivatele, zmenRoli, zrusUcet } from "./akce";

/*
 * Ovládání obrazovky Uživatelé (krok 1C). Okno je pohodlí, ne ochrana —
 * oprávnění i pojistky (vlastní účet, poslední majitel) hlídají akce.
 */

const POLE = "rounded-md border border-okraj bg-pozadi px-3 py-2";
const TLACITKO =
  "rounded-md border border-okraj px-3 py-2 text-sm font-medium disabled:cursor-wait";
const HLAVNI = "rounded-md bg-hlavni px-4 py-2 font-semibold text-hlavni-text disabled:cursor-wait";

type Odkaz = { odkaz: string; platiDo: string };

/** Odkaz k nastavení hesla, který Majitel předá sám. */
function OdkazKPredani({ pro, odkaz, platiDo }: Odkaz & { pro: string }) {
  const [zkopirovano, setZkopirovano] = useState(false);
  async function kopirovat() {
    try {
      await navigator.clipboard.writeText(odkaz);
      setZkopirovano(true);
    } catch {
      setZkopirovano(false);
    }
  }
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md border border-hlavni bg-pozadi p-3"
    >
      <p className="font-medium">Odkaz k nastavení hesla pro: {pro}</p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-tlumeny">Předejte ho sami (SMS, osobně), nikomu jinému.</span>
        <input
          readOnly
          value={odkaz}
          aria-label={`Odkaz k nastavení hesla pro: ${pro}`}
          className={`${POLE} min-w-0 font-mono text-sm`}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={kopirovat} className={TLACITKO}>
          {zkopirovano ? "Zkopírováno ✓" : "Kopírovat odkaz"}
        </button>
        <p className="text-sm text-text-tlumeny">
          Platí jednou, do {DATUM_CAS.format(new Date(platiDo))}.
        </p>
      </div>
    </div>
  );
}

export function NovyUzivatel() {
  const [chyba, setChyba] = useState<string | null>(null);
  const [vysledek, setVysledek] = useState<(Odkaz & { jmeno: string }) | null>(null);
  const [odesila, setOdesila] = useState(false);

  async function odeslat(udalost: FormEvent<HTMLFormElement>) {
    udalost.preventDefault();
    const formular = udalost.currentTarget;
    const data = new FormData(formular);
    setChyba(null);
    setOdesila(true);
    const odpoved = await zalozUzivatele({
      jmeno: String(data.get("jmeno") ?? ""),
      email: String(data.get("email") ?? ""),
      role: String(data.get("role") ?? ""),
    });
    setOdesila(false);
    if (!odpoved.ok) {
      setChyba(odpoved.chyba);
      return;
    }
    formular.reset();
    setVysledek({ jmeno: odpoved.jmeno, odkaz: odpoved.odkaz, platiDo: odpoved.platiDo });
  }

  return (
    <section
      aria-labelledby="novy"
      className="flex flex-col gap-3 rounded-lg border border-okraj bg-povrch p-4 sm:p-5"
    >
      <h2 id="novy" className="text-xl font-bold">
        Přidat uživatele
      </h2>
      <form onSubmit={odeslat} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">Jméno a příjmení</span>
          <input
            name="jmeno"
            required
            minLength={2}
            maxLength={100}
            autoComplete="off"
            className={POLE}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">E-mail</span>
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            className={POLE}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Role</span>
          <select name="role" defaultValue="TECHNIK" className={POLE}>
            {ROLE.map((r) => (
              <option key={r} value={r}>
                {NAZEV_ROLE[r]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={odesila}
          className={`${HLAVNI} sm:col-span-3 sm:justify-self-start`}
        >
          {odesila ? "Zakládám…" : "Založit účet"}
        </button>
      </form>
      {chyba && (
        <p role="alert" className="font-medium text-chyba">
          {chyba}
        </p>
      )}
      {vysledek && (
        <OdkazKPredani pro={vysledek.jmeno} odkaz={vysledek.odkaz} platiDo={vysledek.platiDo} />
      )}
    </section>
  );
}

type Radek = {
  id: string;
  jmeno: string;
  email: string;
  role: Role;
  maHeslo: boolean;
  odkazPlatiDo: string | null;
};

export function RadekUzivatele({ uzivatel, jsemTo }: { uzivatel: Radek; jsemTo: boolean }) {
  const [role, setRole] = useState<Role>(uzivatel.role);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const [odkaz, setOdkaz] = useState<Odkaz | null>(null);
  const [pracuje, setPracuje] = useState(false);

  const stav = uzivatel.maHeslo
    ? "Heslo nastavené"
    : uzivatel.odkazPlatiDo
      ? `Čeká na nastavení hesla (odkaz platí do ${DATUM_CAS.format(new Date(uzivatel.odkazPlatiDo))})`
      : "Bez hesla — odkaz propadl, vytvořte nový";

  async function ulozRoli() {
    setChyba(null);
    setZprava(null);
    setPracuje(true);
    const odpoved = await zmenRoli(uzivatel.id, role);
    setPracuje(false);
    if (odpoved.ok) setZprava(`Role změněna: ${NAZEV_ROLE[role]}.`);
    else setChyba(odpoved.chyba);
  }

  async function vytvorOdkaz() {
    setChyba(null);
    setZprava(null);
    setPracuje(true);
    const odpoved = await novyOdkaz(uzivatel.id);
    setPracuje(false);
    if (odpoved.ok) setOdkaz({ odkaz: odpoved.odkaz, platiDo: odpoved.platiDo });
    else setChyba(odpoved.chyba);
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-okraj bg-povrch p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p>
          <span className="font-semibold">{uzivatel.jmeno}</span>
          {jsemTo && <span className="text-text-tlumeny"> (vy)</span>}
        </p>
        <p className="text-sm text-text-tlumeny">{NAZEV_ROLE[uzivatel.role]}</p>
      </div>
      <p className="-mt-2 text-sm break-all text-text-tlumeny">{uzivatel.email}</p>
      <p className="text-sm">{stav}</p>

      {jsemTo ? (
        <p className="text-sm text-text-tlumeny">Vlastní roli ani účet tady změnit nejde.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              aria-label={`Role pro: ${uzivatel.jmeno}`}
              className={POLE}
            >
              {ROLE.map((r) => (
                <option key={r} value={r}>
                  {NAZEV_ROLE[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={ulozRoli}
            disabled={pracuje || role === uzivatel.role}
            className={`${TLACITKO} disabled:cursor-not-allowed`}
          >
            Uložit roli
          </button>
          <button type="button" onClick={vytvorOdkaz} disabled={pracuje} className={TLACITKO}>
            Nový odkaz k heslu
          </button>
          <ZruseniUctu id={uzivatel.id} jmeno={uzivatel.jmeno} />
        </div>
      )}

      {zprava && (
        <p role="status" className="text-sm font-medium">
          {zprava}
        </p>
      )}
      {chyba && (
        <p role="alert" className="text-sm font-medium text-chyba">
          {chyba}
        </p>
      )}
      {odkaz && <OdkazKPredani pro={uzivatel.jmeno} odkaz={odkaz.odkaz} platiDo={odkaz.platiDo} />}
    </li>
  );
}

/**
 * Potvrzovací okno zrušení účtu (pravidlo z CRM): co se ruší jménem, že to
 * nejde vzít zpět, kdy to portál odmítne. Při chybě okno zůstane otevřené.
 */
function ZruseniUctu({ id, jmeno }: { id: string; jmeno: string }) {
  const okno = useRef<HTMLDialogElement>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);

  async function potvrdit() {
    setChyba(null);
    setPracuje(true);
    const odpoved = await zrusUcet(id);
    setPracuje(false);
    if (odpoved.ok) okno.current?.close();
    else setChyba(odpoved.chyba);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setChyba(null);
          okno.current?.showModal();
        }}
        className="rounded-md border border-chyba px-3 py-2 text-sm font-medium text-chyba"
      >
        Zrušit účet
      </button>
      <dialog
        ref={okno}
        aria-labelledby={`zruseni-${id}`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-okraj bg-povrch p-5 text-text backdrop:bg-black/50"
      >
        <h2 id={`zruseni-${id}`} className="text-lg font-bold">
          Zrušit účet: {jmeno}?
        </h2>
        <p className="mt-3">
          Přihlášení na všech zařízeních okamžitě skončí a znovu se přihlásit nepůjde. Zakázky v
          historii zůstanou i se jménem.
        </p>
        <p className="mt-2 font-medium">Tuto akci nelze vzít zpět.</p>
        <p className="mt-2 text-sm text-text-tlumeny">
          Vlastní účet ani posledního majitele zrušit nejde.
        </p>
        {chyba && (
          <p role="alert" className="mt-3 font-medium text-chyba">
            {chyba}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => okno.current?.close()} className={TLACITKO}>
            Ponechat účet
          </button>
          <button
            type="button"
            onClick={potvrdit}
            disabled={pracuje}
            className="rounded-md bg-chyba px-4 py-2 text-sm font-semibold text-hlavni-text disabled:cursor-wait"
          >
            {pracuje ? "Ruším…" : "Ano, zrušit účet"}
          </button>
        </div>
      </dialog>
    </>
  );
}
