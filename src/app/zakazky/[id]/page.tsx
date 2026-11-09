import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { polozkyKVyberu } from "@/lib/cenik";
import { vidiCeny } from "@/lib/ceny";
import { seznamTechniku } from "@/lib/prideleni";
import { DATUM_CAS } from "@/lib/role";
import { vyzadujPrihlaseni } from "@/lib/sezeni";
import { idSchema } from "@/lib/uzivatele";
import { nactiVykaz } from "@/lib/vykaz";
import { dnesVPraze } from "@/lib/vykaz-pravidla";
import { vyberZakazniku } from "@/lib/zakaznici";
import { DEN, denDoFormulare, detailZakazky } from "@/lib/zakazky";

import { Historie } from "../../historie";
import { Stranka } from "../../stranka";
import { KARTA } from "../../styly";
import { FormularZakazky, SmazaniZakazky } from "../formular";
import { OdznakStavu } from "../odznak";
import { KrokTechnika, PrideleniAStav } from "../stav";
import { Vykaz } from "../vykaz";

export const metadata: Metadata = { title: "Zakázka" };
export const dynamic = "force-dynamic";

/**
 * Detail zakázky (kroky 2A, 2B a 2C). Oprávnění (Jakub, 8. 11. 2026):
 * - Majitel a Dispečer vidí všechny, upravují je, přidělují technika
 *   a mění stav; **smazat a „Vyfakturovaná“ jen Majitel**,
 * - **Technik jen své přidělené zakázky** (cizí = 404, podmínka je
 *   v dotazu `viditelneZakazky()`); vidí kontakt zákazníka, ale ne jeho
 *   kartu, a posune stav jen dopředu (Začít práci, Hotovo),
 * - výkaz (krok 2C): Technik zapisuje u své zakázky do stavu Hotová a mění
 *   jen své řádky, Majitel a Dispečer u každé; u Vyfakturované nikdo,
 * - ceny (krok 4A, Jakub 9. 11. 2026) vidí jen Majitel a Dispečer — Technik
 *   z ceníku dostane jen názvy a jednotky materiálu,
 * - nepřihlášený jde na přihlášení; smazaná nebo neexistující = 404.
 */
export default async function DetailZakazky({ params }: PageProps<"/zakazky/[id]">) {
  const uzivatel = await vyzadujPrihlaseni();
  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const zakazka = await detailZakazky(uzivatel, id.data);
  if (!zakazka) notFound();
  const technik = uzivatel.role === "TECHNIK";
  const [zakaznici, technici, vykaz, polozky] = await Promise.all([
    technik ? [] : vyberZakazniku(),
    technik ? [] : seznamTechniku(),
    nactiVykaz(uzivatel, zakazka.id, zakazka.stav),
    polozkyKVyberu(vidiCeny(uzivatel.role)),
  ]);
  const zamceno = vykaz.smiPsat
    ? null
    : zakazka.stav === "VYFAKTUROVANA"
      ? "Zakázka je vyfakturovaná, výkaz už nejde měnit."
      : "Zakázka je hotová, výkaz už měnit nemůžete. Opravu udělá dispečer nebo majitel.";

  return (
    <Stranka
      uzivatel={uzivatel}
      aktivni="zakazky"
      nadNadpisem={
        <Link href="/" className="underline-offset-4 hover:underline">
          ← Zakázky
        </Link>
      }
      nadpis={`Zakázka č. ${zakazka.cislo}`}
      akce={uzivatel.role === "MAJITEL" && <SmazaniZakazky id={zakazka.id} cislo={zakazka.cislo} />}
    >
      <section aria-labelledby="stav" className={KARTA}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="stav" className="text-xl font-bold">
            Stav
          </h2>
          <OdznakStavu stav={zakazka.stav} />
          <span className="text-text-tlumeny">
            {zakazka.technik ? `technik ${zakazka.technik.name}` : "bez technika"}
          </span>
        </div>
        <div className="mt-4">
          {technik ? (
            <KrokTechnika id={zakazka.id} stav={zakazka.stav} bezPrace={vykaz.prace.length === 0} />
          ) : (
            <PrideleniAStav
              id={zakazka.id}
              stav={zakazka.stav}
              technikId={zakazka.technik?.id ?? null}
              technici={technici}
              role={uzivatel.role}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="udaje" className={KARTA}>
        <h2 id="udaje" className="text-xl font-bold">
          Údaje
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-text-tlumeny">Zákazník</dt>
          <dd className="break-words">
            {technik ? (
              <span className="font-medium">{zakazka.zakaznik.name}</span>
            ) : (
              <Link
                href={`/zakaznici/${zakazka.zakaznik.id}`}
                className="font-medium text-hlavni underline-offset-4 hover:underline"
              >
                {zakazka.zakaznik.name}
              </Link>
            )}
          </dd>
          {zakazka.zakaznik.phone && (
            <>
              <dt className="text-text-tlumeny">Telefon</dt>
              <dd>
                <a
                  href={`tel:${zakazka.zakaznik.phone.replace(/\s/g, "")}`}
                  className="text-hlavni underline-offset-4 hover:underline"
                >
                  {zakazka.zakaznik.phone}
                </a>
              </dd>
            </>
          )}
          <dt className="text-text-tlumeny">Místo výjezdu</dt>
          <dd className="break-words">{zakazka.misto}</dd>
          <dt className="text-text-tlumeny">Termín</dt>
          <dd>{zakazka.termin ? DEN.format(zakazka.termin) : "—"}</dd>
          <dt className="text-text-tlumeny">Založeno</dt>
          <dd>{DATUM_CAS.format(zakazka.zalozeno)}</dd>
        </dl>
        <h3 className="mt-4 font-semibold">Co je potřeba udělat</h3>
        <p className="mt-1 break-words whitespace-pre-line">{zakazka.popis}</p>
        {!technik && (
          <details className="mt-4">
            <summary className="cursor-pointer font-medium text-hlavni">Upravit zakázku</summary>
            <div className="mt-4">
              <FormularZakazky
                id={zakazka.id}
                zakaznici={zakaznici}
                puvodni={{
                  zakaznikId: zakazka.zakaznik.id,
                  misto: zakazka.misto,
                  popis: zakazka.popis,
                  termin: denDoFormulare(zakazka.termin),
                }}
              />
            </div>
          </details>
        )}
      </section>

      <Vykaz
        zakazkaId={zakazka.id}
        data={vykaz}
        dnes={dnesVPraze()}
        zamceno={zamceno}
        polozky={polozky}
      />

      <Historie entita="zakazka" id={zakazka.id} />
    </Stranka>
  );
}
