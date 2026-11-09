"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { SmazaniSPotvrzenim } from "../potvrzeni";
import { HLAVNI, POLE } from "../styly";
import { smazZakazku, upravZakazku, zalozZakazku } from "./akce";

/*
 * Formulář zakázky (krok 2A) — stejný pro založení i úpravu.
 * Ověření je v akci (zod), tady jen pohodlí prohlížeče.
 */

export type Zakazka = { zakaznikId: string; misto: string; popis: string; termin: string };
type Zakaznik = { id: string; name: string; address: string | null };

export function FormularZakazky({
  id,
  puvodni,
  zakaznici,
}: {
  id?: string;
  puvodni?: Zakazka;
  zakaznici: Zakaznik[];
}) {
  const router = useRouter();
  const [chyba, setChyba] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);
  const [misto, setMisto] = useState(puvodni?.misto ?? "");

  if (zakaznici.length === 0) {
    return (
      <p>
        Nejdřív je potřeba{" "}
        <Link href="/zakaznici/novy" className="font-medium text-hlavni underline">
          založit zákazníka
        </Link>
        .
      </p>
    );
  }

  /** U nové zakázky předvyplní místo adresou vybraného zákazníka. */
  function vyberZakaznika(zakaznikId: string) {
    if (id || misto) return;
    setMisto(zakaznici.find((z) => z.id === zakaznikId)?.address ?? "");
  }

  async function odeslat(udalost: FormEvent<HTMLFormElement>) {
    udalost.preventDefault();
    const data = new FormData(udalost.currentTarget);
    const udaje = Object.fromEntries(
      ["zakaznikId", "misto", "popis", "termin"].map((k) => [k, String(data.get(k) ?? "")]),
    );
    setChyba(null);
    setZprava(null);
    setOdesila(true);
    if (id) {
      const odpoved = await upravZakazku(id, udaje);
      setOdesila(false);
      if (odpoved.ok) setZprava("Uloženo.");
      else setChyba(odpoved.chyba);
      return;
    }
    const odpoved = await zalozZakazku(udaje);
    if (!odpoved.ok) {
      setOdesila(false);
      setChyba(odpoved.chyba);
      return;
    }
    router.push(`/zakazky/${odpoved.id}`);
  }

  return (
    <form onSubmit={odeslat} className="grid gap-4 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <span className="font-medium">Zákazník</span>
        <select
          name="zakaznikId"
          required
          defaultValue={puvodni?.zakaznikId ?? ""}
          onChange={(e) => vyberZakaznika(e.target.value)}
          className={POLE}
        >
          <option value="" disabled>
            Vyberte zákazníka…
          </option>
          {zakaznici.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">Místo výjezdu</span>
        <input
          name="misto"
          required
          minLength={3}
          maxLength={200}
          value={misto}
          onChange={(e) => setMisto(e.target.value)}
          autoComplete="off"
          className={POLE}
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">Termín (nepovinné)</span>
        <input name="termin" type="date" defaultValue={puvodni?.termin ?? ""} className={POLE} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <span className="font-medium">Co je potřeba udělat</span>
        <textarea
          name="popis"
          required
          minLength={3}
          maxLength={2000}
          rows={4}
          defaultValue={puvodni?.popis ?? ""}
          className={POLE}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={odesila} className={HLAVNI}>
          {odesila ? "Ukládám…" : id ? "Uložit změny" : "Založit zakázku"}
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

export function SmazaniZakazky({ id, cislo }: { id: string; cislo: number }) {
  return (
    <SmazaniSPotvrzenim
      id={id}
      tlacitko="Smazat zakázku"
      nadpis={`Smazat zakázku č. ${cislo}?`}
      potvrdit="Ano, smazat zakázku"
      akce={() => smazZakazku(id)}
      po="/"
    >
      <p>Zakázka zmizí ze seznamu zakázek i z karty zákazníka.</p>
    </SmazaniSPotvrzenim>
  );
}
