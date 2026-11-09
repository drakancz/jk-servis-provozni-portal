import type { Metadata } from "next";
import Link from "next/link";

import { korun } from "@/lib/ceny";
import { nactiPrehled, posunTydne, pondeli, tydenSchema } from "@/lib/prehled";
import { vyzadujRoli } from "@/lib/sezeni";
import type { Stav } from "@/lib/stavy";
import { delka, dnesVPraze } from "@/lib/vykaz-pravidla";
import { DEN } from "@/lib/zakazky";

import { Stranka } from "../stranka";
import { KARTA, TLACITKO } from "../styly";
import { OdznakStavu } from "../zakazky/odznak";

export const metadata: Metadata = { title: "Přehled" };
export const dynamic = "force-dynamic";

/** Plný týden technika pro sloupec vytížení (40 h). */
const PLNY_TYDEN_MINUT = 40 * 60;

const DEN_V_TYDNU = new Intl.DateTimeFormat("cs-CZ", { timeZone: "UTC", weekday: "long" });
const DEN_KRATCE = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "UTC",
  day: "numeric",
  month: "numeric",
});

function datum(den: string) {
  return new Date(`${den}T00:00:00Z`);
}

/**
 * Přehled pro majitele (krok 4B). Oprávnění (Jakub, 9. 11. 2026):
 * - **vidí Majitel a Dispečer**, **částky jen Majitel** (server je
 *   Dispečerovi ani nespočítá — `src/lib/prehled.ts`),
 * - **Technik 404**, nepřihlášený jde na přihlášení.
 * `?tyden=` vybírá týden kalendáře (libovolný den); nesmysl = tento týden.
 */
export default async function Prehled({ searchParams }: PageProps<"/prehled">) {
  const uzivatel = await vyzadujRoli("MAJITEL", "DISPECER");
  const parametry = await searchParams;
  const tyden = tydenSchema.parse(
    Array.isArray(parametry.tyden) ? parametry.tyden[0] : (parametry.tyden ?? ""),
  );
  const data = await nactiPrehled(uzivatel, tyden);
  const tentoTyden = pondeli(dnesVPraze());
  const nedele = posunTydne(tyden, 1);
  const popisTydne = `${DEN_KRATCE.format(datum(tyden))} – ${DEN.format(
    new Date(datum(nedele).getTime() - 24 * 60 * 60 * 1000),
  )}`;
  const { pocty, castky } = data;

  const dlazdice: { nazev: string; hodnota: number; popis: string; odkaz: string }[] = [
    {
      nazev: "Otevřené",
      hodnota: pocty.nove + pocty.prideleno + pocty.vPraci,
      popis: `${pocty.nove} nové · ${pocty.prideleno} přidělené · ${pocty.vPraci} v práci`,
      odkaz: "/",
    },
    {
      nazev: "Bez technika",
      hodnota: pocty.nove,
      popis: "čekají na přidělení",
      odkaz: "/?stav=NOVA",
    },
    {
      nazev: "Hotové, nevyfakturované",
      hodnota: pocty.hotove,
      popis: castky ? `${korun(castky.nevyfakturovano)} bez DPH` : "čekají na vyfakturování",
      odkaz: "/?stav=HOTOVA",
    },
    {
      nazev: "Vyfakturované",
      hodnota: pocty.vyfakturovane,
      popis: castky ? `${korun(castky.vyfakturovano)} bez DPH` : "celkem",
      odkaz: "/?stav=VYFAKTUROVANA",
    },
  ];

  return (
    <Stranka
      uzivatel={uzivatel}
      aktivni="prehled"
      nadpis="Přehled"
      popis="Jak na tom firma je: otevřené a nevyfakturované zakázky, vytížení techniků a týden v kalendáři."
    >
      <section aria-labelledby="zakazky" className="flex flex-col gap-3">
        <h2 id="zakazky" className="text-xl font-bold">
          Zakázky
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {dlazdice.map((d) => (
            <li key={d.nazev} className={KARTA}>
              <Link href={d.odkaz} className="group flex flex-col gap-1">
                <span className="font-medium text-text-tlumeny group-hover:underline">
                  {d.nazev}
                </span>
                <span className="text-3xl font-bold tabular-nums">{d.hodnota}</span>
                <span className="text-sm text-text-tlumeny">{d.popis}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {data.poTerminu.length > 0 && (
        <section aria-labelledby="po-terminu" className={KARTA}>
          <h2 id="po-terminu" className="text-xl font-bold">
            Po termínu
          </h2>
          <p className="mt-1 text-text-tlumeny">Otevřené zakázky, jejichž termín už minul.</p>
          <ul className="mt-3 flex flex-col divide-y divide-okraj">
            {data.poTerminu.map((z) => (
              <ZakazkaVSeznamu key={z.id} zakazka={z} sTerminem />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="vytizeni" className={KARTA}>
        <h2 id="vytizeni" className="text-xl font-bold">
          Vytížení techniků
        </h2>
        <p className="mt-1 text-text-tlumeny">
          Odpracováno v týdnu {popisTydne} podle výkazu a otevřené zakázky.
        </p>
        {data.technici.length === 0 ? (
          <p className="mt-3 text-text-tlumeny">Ve firmě zatím není žádný technik.</p>
        ) : (
          <ul aria-label="Technici" className="mt-3 flex flex-col gap-4">
            {data.technici.map((t) => (
              <li key={t.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="font-semibold">{t.jmeno}</span>
                  <span className="text-sm">
                    {t.minut === 0 ? "0 h" : delka(t.minut)} · otevřených zakázek: {t.otevrenych}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="h-2 overflow-hidden rounded-full border border-okraj bg-pozadi"
                >
                  <div
                    className="h-full bg-hlavni"
                    style={{ width: `${Math.min(100, (t.minut / PLNY_TYDEN_MINUT) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tyden" className={KARTA}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="tyden" className="text-xl font-bold">
            Týden {popisTydne}
          </h2>
          <nav aria-label="Výběr týdne" className="flex flex-wrap gap-2">
            <Link href={`/prehled?tyden=${posunTydne(tyden, -1)}`} className={TLACITKO}>
              ← Předchozí týden
            </Link>
            {tyden !== tentoTyden && (
              <Link href="/prehled" className={TLACITKO}>
                Tento týden
              </Link>
            )}
            <Link href={`/prehled?tyden=${posunTydne(tyden, 1)}`} className={TLACITKO}>
              Další týden →
            </Link>
          </nav>
        </div>
        <ol className="mt-3 flex flex-col divide-y divide-okraj">
          {data.dny.map((d) => (
            <li
              key={d.den}
              aria-label={`${DEN_V_TYDNU.format(datum(d.den))} ${DEN.format(datum(d.den))}`}
              className="py-3 first:pt-0 last:pb-0"
            >
              <h3 className="font-semibold first-letter:uppercase">
                {DEN_V_TYDNU.format(datum(d.den))} {DEN_KRATCE.format(datum(d.den))}
                {d.dnes && <span className="ml-2 text-sm font-medium text-zvyrazneni">dnes</span>}
              </h3>
              {d.zakazky.length === 0 ? (
                <p className="text-sm text-text-tlumeny">Žádná zakázka s termínem.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {d.zakazky.map((z) => (
                    <ZakazkaVSeznamu key={z.id} zakazka={z} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
    </Stranka>
  );
}

function ZakazkaVSeznamu({
  zakazka,
  sTerminem = false,
}: {
  zakazka: {
    id: string;
    cislo: number;
    stav: Stav;
    termin: string | null;
    zakaznik: string;
    technik: string | null;
  };
  sTerminem?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
      <Link
        href={`/zakazky/${zakazka.id}`}
        className="font-medium text-hlavni underline-offset-4 hover:underline"
      >
        č. {zakazka.cislo}
      </Link>
      <span className="min-w-0 break-words">{zakazka.zakaznik}</span>
      <OdznakStavu stav={zakazka.stav} />
      <span className="text-sm text-text-tlumeny">
        {zakazka.technik ?? "bez technika"}
        {sTerminem && zakazka.termin ? ` · termín ${DEN.format(datum(zakazka.termin))}` : ""}
      </span>
    </li>
  );
}
