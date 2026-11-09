"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { SmazaniSPotvrzenim } from "../potvrzeni";
import { HLAVNI, POLE } from "../styly";
import { smazZakaznika, upravZakaznika, zalozZakaznika } from "./akce";

/*
 * Formulář zákazníka (krok 2A) — stejný pro založení i úpravu.
 * Ověření je v akci (zod), tady jen pohodlí prohlížeče.
 */

export type Zakaznik = {
  jmeno: string;
  ico: string | null;
  telefon: string | null;
  email: string | null;
  adresa: string | null;
  poznamka: string | null;
};

function Pole({
  nazev,
  popis,
  vychozi,
  ...vlastnosti
}: {
  nazev: string;
  popis: string;
  vychozi?: string | null;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="font-medium">{popis}</span>
      <input name={nazev} defaultValue={vychozi ?? ""} className={POLE} {...vlastnosti} />
    </label>
  );
}

export function FormularZakaznika({ id, puvodni }: { id?: string; puvodni?: Zakaznik }) {
  const router = useRouter();
  const [chyba, setChyba] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);

  async function odeslat(udalost: FormEvent<HTMLFormElement>) {
    udalost.preventDefault();
    const data = new FormData(udalost.currentTarget);
    const udaje = Object.fromEntries(
      ["jmeno", "ico", "telefon", "email", "adresa", "poznamka"].map((k) => [
        k,
        String(data.get(k) ?? ""),
      ]),
    );
    setChyba(null);
    setZprava(null);
    setOdesila(true);
    if (id) {
      const odpoved = await upravZakaznika(id, udaje);
      setOdesila(false);
      if (odpoved.ok) setZprava("Uloženo.");
      else setChyba(odpoved.chyba);
      return;
    }
    const odpoved = await zalozZakaznika(udaje);
    if (!odpoved.ok) {
      setOdesila(false);
      setChyba(odpoved.chyba);
      return;
    }
    router.push(`/zakaznici/${odpoved.id}`);
  }

  return (
    <form onSubmit={odeslat} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Pole
          nazev="jmeno"
          popis="Název firmy nebo jméno"
          vychozi={puvodni?.jmeno}
          required
          minLength={2}
          maxLength={150}
          autoComplete="off"
        />
      </div>
      <Pole
        nazev="ico"
        popis="IČO (nepovinné)"
        vychozi={puvodni?.ico}
        inputMode="numeric"
        pattern="\d{8}"
        title="8 číslic"
        maxLength={8}
        autoComplete="off"
      />
      <Pole
        nazev="telefon"
        popis="Telefon (nepovinné)"
        vychozi={puvodni?.telefon}
        type="tel"
        maxLength={30}
        autoComplete="off"
      />
      <Pole
        nazev="email"
        popis="E-mail (nepovinné)"
        vychozi={puvodni?.email}
        type="email"
        maxLength={254}
        autoComplete="off"
      />
      <Pole
        nazev="adresa"
        popis="Adresa (nepovinné)"
        vychozi={puvodni?.adresa}
        maxLength={200}
        autoComplete="off"
      />
      <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <span className="font-medium">Poznámka (nepovinné)</span>
        <textarea
          name="poznamka"
          defaultValue={puvodni?.poznamka ?? ""}
          maxLength={1000}
          rows={3}
          className={POLE}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={odesila} className={HLAVNI}>
          {odesila ? "Ukládám…" : id ? "Uložit změny" : "Založit zákazníka"}
        </button>
        {zprava && (
          <p role="status" className="font-medium">
            {zprava}
          </p>
        )}
      </div>
      {chyba && (
        <p role="alert" className="font-medium text-chyba sm:col-span-2">
          {chyba}
        </p>
      )}
    </form>
  );
}

export function SmazaniZakaznika({ id, jmeno }: { id: string; jmeno: string }) {
  return (
    <SmazaniSPotvrzenim
      id={id}
      tlacitko="Smazat zákazníka"
      nadpis={`Smazat zákazníka: ${jmeno}?`}
      potvrdit="Ano, smazat zákazníka"
      akce={() => smazZakaznika(id)}
      po="/zakaznici"
    >
      <p>Zákazník zmizí ze seznamu i z výběru u nových zakázek.</p>
      <p className="text-sm text-text-tlumeny">
        Zákazníka, který má zakázky, smazat nejde — nejdřív je potřeba smazat jeho zakázky.
      </p>
    </SmazaniSPotvrzenim>
  );
}
