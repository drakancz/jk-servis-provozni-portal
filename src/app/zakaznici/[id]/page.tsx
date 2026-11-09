import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { vyzadujRoli } from "@/lib/sezeni";
import { idSchema } from "@/lib/uzivatele";
import { detailZakaznika } from "@/lib/zakaznici";
import { DEN } from "@/lib/zakazky";

import { Historie } from "../../historie";
import { Stranka } from "../../stranka";
import { HLAVNI, KARTA } from "../../styly";
import { FormularZakaznika, SmazaniZakaznika } from "../formular";

export const metadata: Metadata = { title: "Zákazník" };
export const dynamic = "force-dynamic";

/**
 * Karta zákazníka (krok 2A). Oprávnění (Jakub, 8. 11. 2026):
 * - vidí a upravuje Majitel a Dispečer, **smazat smí jen Majitel**,
 * - Technik dostane 404, nepřihlášený jde na přihlášení,
 * - smazaný nebo neexistující zákazník = 404.
 */
export default async function KartaZakaznika({ params }: PageProps<"/zakaznici/[id]">) {
  const uzivatel = await vyzadujRoli("MAJITEL", "DISPECER");
  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const zakaznik = await detailZakaznika(id.data);
  if (!zakaznik) notFound();

  const kontakty: [string, string | null][] = [
    ["IČO", zakaznik.ico],
    ["Telefon", zakaznik.telefon],
    ["E-mail", zakaznik.email],
    ["Adresa", zakaznik.adresa],
  ];

  return (
    <Stranka
      uzivatel={uzivatel}
      aktivni="zakaznici"
      nadNadpisem={
        <Link href="/zakaznici" className="underline-offset-4 hover:underline">
          ← Zákazníci
        </Link>
      }
      nadpis={zakaznik.jmeno}
      akce={
        uzivatel.role === "MAJITEL" && <SmazaniZakaznika id={zakaznik.id} jmeno={zakaznik.jmeno} />
      }
    >
      <section aria-labelledby="udaje" className={KARTA}>
        <h2 id="udaje" className="text-xl font-bold">
          Údaje
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {kontakty.map(([nazev, hodnota]) => (
            <div key={nazev} className="contents">
              <dt className="text-text-tlumeny">{nazev}</dt>
              <dd className="break-words">{hodnota ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {zakaznik.poznamka && (
          <p className="mt-3 break-words whitespace-pre-line">{zakaznik.poznamka}</p>
        )}
        <details className="mt-4">
          <summary className="cursor-pointer font-medium text-hlavni">Upravit údaje</summary>
          <div className="mt-4">
            <FormularZakaznika
              id={zakaznik.id}
              puvodni={{
                jmeno: zakaznik.jmeno,
                ico: zakaznik.ico,
                telefon: zakaznik.telefon,
                email: zakaznik.email,
                adresa: zakaznik.adresa,
                poznamka: zakaznik.poznamka,
              }}
            />
          </div>
        </details>
      </section>

      <section aria-labelledby="zakazky" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="zakazky" className="text-xl font-bold">
            Zakázky ({zakaznik.zakazky.length})
          </h2>
          <Link href={`/zakazky/nova?zakaznik=${zakaznik.id}`} className={HLAVNI}>
            Nová zakázka
          </Link>
        </div>
        {zakaznik.zakazky.length === 0 ? (
          <p className="text-text-tlumeny">Zákazník zatím nemá žádnou zakázku.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-okraj rounded-lg border border-okraj bg-povrch">
            {zakaznik.zakazky.map((z) => (
              <li key={z.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <Link
                    href={`/zakazky/${z.id}`}
                    className="font-semibold text-hlavni underline-offset-4 hover:underline"
                  >
                    Zakázka č. {z.number}
                  </Link>
                  <span className="text-sm text-text-tlumeny">
                    {z.dueDate ? `termín ${DEN.format(z.dueDate)}` : "bez termínu"}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm break-words">{z.description}</p>
                <p className="text-sm break-words text-text-tlumeny">{z.place}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Historie entita="zakaznik" id={zakaznik.id} />
    </Stranka>
  );
}
