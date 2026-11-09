import type { ReactNode } from "react";

import type { Prihlaseny } from "@/lib/sezeni";

import { Hlavicka, type Sekce } from "./hlavicka";
import { PruhUkazky } from "./pruh-ukazky";

/** Rám přihlášené obrazovky: hlavička, nadpis firmy a obsah. */
export function Stranka({
  uzivatel,
  aktivni,
  nadpis,
  nadNadpisem = "JK servis s.r.o.",
  popis,
  akce,
  children,
}: {
  uzivatel: Prihlaseny;
  aktivni: Sekce;
  nadpis: string;
  nadNadpisem?: ReactNode;
  popis?: ReactNode;
  akce?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      {/* WCAG 2.4.1: z klávesnice přeskočí pruh, hlavičku i menu. */}
      <a
        href="#obsah"
        className="sr-only rounded-md bg-hlavni px-4 py-2 font-semibold text-hlavni-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Přeskočit na obsah
      </a>
      <PruhUkazky />
      <Hlavicka uzivatel={uzivatel} aktivni={aktivni} />
      <main
        id="obsah"
        tabIndex={-1}
        className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 focus:outline-none"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-wide text-zvyrazneni uppercase">
              {nadNadpisem}
            </p>
            <h1 className="mt-2 text-3xl font-bold break-words sm:text-4xl">{nadpis}</h1>
            {popis && <p className="mt-2 max-w-prose text-text-tlumeny">{popis}</p>}
          </div>
          {akce}
        </div>
        {children}
      </main>
    </div>
  );
}
