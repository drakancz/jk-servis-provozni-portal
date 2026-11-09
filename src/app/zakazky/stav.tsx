"use client";

import { useState } from "react";

import { KROK_TECHNIKA, NAZEV_STAVU, smiZmenitStav, STAVY, type Stav } from "@/lib/stavy";

import { HLAVNI, POLE, TLACITKO } from "../styly";
import { pridelTechnika, zmenStav } from "./akce";

/*
 * Přidělení a stavy v detailu zakázky (krok 2B). Okno i výběr jsou
 * pohodlí — co kdo smí, hlídá znovu akce na serveru.
 */

type Role = "MAJITEL" | "DISPECER" | "TECHNIK";

function useAkce() {
  const [chyba, setChyba] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);
  async function spust(
    akce: () => Promise<{ ok: true } | { ok: false; chyba: string }>,
    hotovo: string,
  ) {
    setChyba(null);
    setZprava(null);
    setPracuje(true);
    const odpoved = await akce();
    setPracuje(false);
    if (odpoved.ok) setZprava(hotovo);
    else setChyba(odpoved.chyba);
  }
  return { chyba, zprava, pracuje, spust };
}

function Hlasky({ chyba, zprava }: { chyba: string | null; zprava: string | null }) {
  return (
    <>
      {zprava && (
        <p role="status" className="font-medium">
          {zprava}
        </p>
      )}
      {chyba && (
        <p role="alert" className="font-medium text-chyba">
          {chyba}
        </p>
      )}
    </>
  );
}

/** Majitel a Dispečer: komu je zakázka přidělená a v jakém je stavu. */
export function PrideleniAStav({
  id,
  stav,
  technikId,
  technici,
  role,
}: {
  id: string;
  stav: Stav;
  technikId: string | null;
  technici: { id: string; name: string }[];
  role: Role;
}) {
  const { chyba, zprava, pracuje, spust } = useAkce();
  const [technik, setTechnik] = useState(technikId ?? "");
  const moznosti = STAVY.filter((na) => smiZmenitStav(role, stav, na));
  const [novy, setNovy] = useState<Stav | "">(moznosti[0] ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <span className="font-medium">Technik</span>
          <select value={technik} onChange={(e) => setTechnik(e.target.value)} className={POLE}>
            <option value="">— nepřiděleno —</option>
            {technici.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pracuje || technik === (technikId ?? "")}
          onClick={() => spust(() => pridelTechnika(id, technik), "Přidělení uloženo.")}
          className={`${TLACITKO} disabled:cursor-not-allowed`}
        >
          Uložit přidělení
        </button>
      </div>
      {moznosti.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
            <span className="font-medium">Změnit stav na</span>
            <select value={novy} onChange={(e) => setNovy(e.target.value as Stav)} className={POLE}>
              {moznosti.map((s) => (
                <option key={s} value={s}>
                  {NAZEV_STAVU[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pracuje || !novy}
            onClick={() =>
              novy && spust(() => zmenStav(id, stav, novy), `Stav změněn: ${NAZEV_STAVU[novy]}.`)
            }
            className={TLACITKO}
          >
            Změnit stav
          </button>
        </div>
      )}
      {role === "DISPECER" && stav === "VYFAKTUROVANA" && (
        <p className="text-sm text-text-tlumeny">Vyfakturovanou zakázku může změnit jen majitel.</p>
      )}
      <Hlasky chyba={chyba} zprava={zprava} />
    </div>
  );
}

/** Technik: jediný další krok u své zakázky (Začít práci / Hotovo). */
export function KrokTechnika({
  id,
  stav,
  bezPrace,
}: {
  id: string;
  stav: Stav;
  /** Ve výkazu ještě není žádná práce — Hotovo by server odmítl (krok 2C). */
  bezPrace: boolean;
}) {
  const { chyba, zprava, pracuje, spust } = useAkce();
  const krok = KROK_TECHNIKA[stav];
  return (
    <div className="flex flex-col gap-3">
      {krok && (
        <button
          type="button"
          disabled={pracuje}
          onClick={() =>
            spust(() => zmenStav(id, stav, krok.na), `Stav změněn: ${NAZEV_STAVU[krok.na]}.`)
          }
          className={`${HLAVNI} w-full sm:w-auto sm:self-start`}
        >
          {krok.tlacitko}
        </button>
      )}
      {krok?.na === "HOTOVA" && bezPrace && (
        <p className="text-text-tlumeny">Před dokončením zapište práci do výkazu níže.</p>
      )}
      {!krok && (
        <p className="text-text-tlumeny">
          {stav === "HOTOVA" || stav === "VYFAKTUROVANA"
            ? "Zakázka je hotová. Další kroky řeší dispečer a majitel."
            : "Zakázka čeká na přidělení."}
        </p>
      )}
      <Hlasky chyba={chyba} zprava={zprava} />
    </div>
  );
}
