import Link from "next/link";

import { precti } from "@/lib/hledani";
import { stavSchema } from "@/lib/prideleni";
import { vyzadujPrihlaseni } from "@/lib/sezeni";
import { NAZEV_STAVU, STAVY } from "@/lib/stavy";
import { DEN, seznamZakazek } from "@/lib/zakazky";

import { Hledani } from "./hledani";
import { Stranka } from "./stranka";
import { HLAVNI, KARTA, TLACITKO } from "./styly";
import { OdznakStavu } from "./zakazky/odznak";

export const dynamic = "force-dynamic";

/**
 * Zakázky — úvodní stránka po přihlášení (kroky 2A a 2B).
 * Oprávnění (Jakub, 7. a 8. 11. 2026):
 * - Majitel a Dispečer vidí všechny zakázky a zakládají nové,
 * - Technik vidí jen zakázky přidělené jemu (podmínka v dotazu),
 * - nepřihlášený jde na přihlášení.
 * `?stav=` filtruje podle stavu; nesmyslná hodnota se tiše ignoruje.
 */
export default async function StrankaZakazek({ searchParams }: PageProps<"/">) {
  const uzivatel = await vyzadujPrihlaseni();
  const parametry = await searchParams;
  const hledany = precti(parametry.q);
  const stavParam = stavSchema.safeParse(
    Array.isArray(parametry.stav) ? parametry.stav[0] : parametry.stav,
  );
  const stav = stavParam.success ? stavParam.data : null;
  const zakazky = await seznamZakazek(uzivatel, hledany, stav);
  const technik = uzivatel.role === "TECHNIK";

  const adresa = (s: string | null) => {
    const p = new URLSearchParams();
    if (hledany) p.set("q", hledany);
    if (s) p.set("stav", s);
    const q = p.toString();
    return q ? `/?${q}` : "/";
  };

  return (
    <Stranka
      uzivatel={uzivatel}
      aktivni="zakazky"
      nadpis="Zakázky"
      popis={technik ? "Zakázky, které vám přidělil dispečer." : undefined}
      akce={
        !technik && (
          <div className="flex flex-wrap gap-2">
            {/* Export (krok 3C) jen Majitel a Dispečer, podle filtru seznamu.
                Obyčejný odkaz, ne <Link> — soubor se nemá přednačítat. */}
            <a href={`/zakazky/export${adresa(stav).slice(1)}`} download className={TLACITKO}>
              Stáhnout do Excelu
            </a>
            <Link href="/zakazky/nova" className={HLAVNI}>
              Nová zakázka
            </Link>
          </div>
        )
      }
    >
      <Hledani
        adresa="/"
        hledany={hledany}
        popis="Hledat podle čísla, zákazníka, místa nebo popisu"
      />
      <nav aria-label="Filtr podle stavu" className="flex flex-wrap gap-2 text-sm">
        {[null, ...STAVY].map((s) => (
          <Link
            key={s ?? "vse"}
            href={adresa(s)}
            aria-current={s === stav ? "page" : undefined}
            className="rounded-full border border-okraj px-3 py-1 font-medium aria-[current=page]:border-hlavni aria-[current=page]:bg-hlavni aria-[current=page]:text-hlavni-text"
          >
            {s ? NAZEV_STAVU[s] : "Všechny"}
          </Link>
        ))}
      </nav>
      {zakazky.length === 0 ? (
        technik && !hledany && !stav ? (
          <div className={KARTA}>
            <p className="font-medium">Zatím tu nemáte žádnou přidělenou zakázku.</p>
            <p className="mt-1 text-text-tlumeny">
              Zakázky, které vám přidělí dispečer, se objeví tady.
            </p>
          </div>
        ) : (
          <p className="text-text-tlumeny">
            {hledany || stav ? "Nic neodpovídá hledání." : "Zatím tu není žádná zakázka."}
          </p>
        )
      ) : (
        <ul
          aria-label="Seznam zakázek"
          className="flex flex-col divide-y divide-okraj rounded-lg border border-okraj bg-povrch"
        >
          {zakazky.map((z) => (
            <li key={z.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/zakazky/${z.id}`}
                    className="font-semibold text-hlavni underline-offset-4 hover:underline"
                  >
                    Zakázka č. {z.cislo}
                  </Link>
                  <OdznakStavu stav={z.stav} />
                </span>
                <span className="text-sm text-text-tlumeny">
                  {z.termin ? `termín ${DEN.format(z.termin)}` : "bez termínu"}
                </span>
              </div>
              <p className="font-medium break-words">{z.zakaznik}</p>
              <p className="line-clamp-2 text-sm break-words">{z.popis}</p>
              <p className="text-sm break-words text-text-tlumeny">
                {z.misto}
                {!technik && ` · ${z.technik ?? "bez technika"}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Stranka>
  );
}
