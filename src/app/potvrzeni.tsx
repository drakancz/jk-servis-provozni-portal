"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { NEBEZPECNE, NEBEZPECNE_PLNE, TLACITKO } from "./styly";

/**
 * Potvrzovací okno smazání (pravidlo z CRM): co se maže jménem, že to
 * nejde vzít zpět, kdy to portál odmítne, tlačítko Zrušit. Při odmítnutí
 * ze serveru okno zůstane otevřené s hláškou; po úspěchu přejde na `po`.
 * Okno je pohodlí, ne ochrana — oprávnění i pravidla hlídá akce.
 */
export function SmazaniSPotvrzenim({
  id,
  tlacitko,
  nadpis,
  children,
  potvrdit,
  akce,
  po,
}: {
  id: string;
  tlacitko: string;
  nadpis: string;
  children: ReactNode;
  potvrdit: string;
  akce: () => Promise<{ ok: true } | { ok: false; chyba: string }>;
  po: string;
}) {
  const okno = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);

  async function smazat() {
    setChyba(null);
    setPracuje(true);
    const odpoved = await akce();
    if (!odpoved.ok) {
      setPracuje(false);
      setChyba(odpoved.chyba);
      return;
    }
    okno.current?.close();
    router.push(po);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setChyba(null);
          okno.current?.showModal();
        }}
        className={NEBEZPECNE}
      >
        {tlacitko}
      </button>
      <dialog
        ref={okno}
        aria-labelledby={`smazani-${id}`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-okraj bg-povrch p-5 text-text backdrop:bg-black/50"
      >
        <h2 id={`smazani-${id}`} className="text-lg font-bold break-words">
          {nadpis}
        </h2>
        <div className="mt-3 flex flex-col gap-2">{children}</div>
        <p className="mt-2 font-medium">Tuto akci nelze vzít zpět.</p>
        {chyba && (
          <p role="alert" className="mt-3 font-medium text-chyba">
            {chyba}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => okno.current?.close()} className={TLACITKO}>
            Zrušit
          </button>
          <button type="button" onClick={smazat} disabled={pracuje} className={NEBEZPECNE_PLNE}>
            {pracuje ? "Mažu…" : potvrdit}
          </button>
        </div>
      </dialog>
    </>
  );
}
