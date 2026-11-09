import Link from "next/link";

import { POLE, TLACITKO } from "./styly";

/** Hledací pole seznamu (obyčejný formulář, výraz jde do adresy `?q=`). */
export function Hledani({
  adresa,
  hledany,
  popis,
}: {
  adresa: string;
  hledany: string;
  popis: string;
}) {
  return (
    <form action={adresa} role="search" className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <span className="font-medium">{popis}</span>
        <input
          name="q"
          type="search"
          defaultValue={hledany}
          maxLength={100}
          autoComplete="off"
          className={POLE}
        />
      </label>
      <button type="submit" className={TLACITKO}>
        Hledat
      </button>
      {hledany && (
        <Link href={adresa} className={TLACITKO}>
          Zrušit hledání
        </Link>
      )}
    </form>
  );
}
