import type { Metadata } from "next";
import Link from "next/link";

import { precti } from "@/lib/hledani";
import { vyzadujRoli } from "@/lib/sezeni";
import { seznamZakazniku } from "@/lib/zakaznici";

import { Hledani } from "../hledani";
import { Stranka } from "../stranka";
import { HLAVNI } from "../styly";

export const metadata: Metadata = { title: "Zákazníci" };
export const dynamic = "force-dynamic";

/**
 * Seznam zákazníků (krok 2A). Oprávnění (Jakub, 8. 11. 2026):
 * - vidí Majitel a Dispečer; Technik dostane 404 (zákazníka uvidí jen
 *   u své zakázky, krok 2B),
 * - nepřihlášený jde na přihlášení.
 */
export default async function StrankaZakazniku({ searchParams }: PageProps<"/zakaznici">) {
  const uzivatel = await vyzadujRoli("MAJITEL", "DISPECER");
  const hledany = precti((await searchParams).q);
  const zakaznici = await seznamZakazniku(hledany);

  return (
    <Stranka
      uzivatel={uzivatel}
      aktivni="zakaznici"
      nadpis="Zákazníci"
      akce={
        <Link href="/zakaznici/novy" className={HLAVNI}>
          Nový zákazník
        </Link>
      }
    >
      <Hledani
        adresa="/zakaznici"
        hledany={hledany}
        popis="Hledat podle názvu, IČO, telefonu nebo adresy"
      />
      {zakaznici.length === 0 ? (
        <p className="text-text-tlumeny">
          {hledany ? "Nic neodpovídá hledání." : "Zatím tu není žádný zákazník."}
        </p>
      ) : (
        <ul
          aria-label="Seznam zákazníků"
          className="flex flex-col divide-y divide-okraj rounded-lg border border-okraj bg-povrch"
        >
          {zakaznici.map((z) => (
            <li key={z.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <Link
                  href={`/zakaznici/${z.id}`}
                  className="font-semibold break-words text-hlavni underline-offset-4 hover:underline"
                >
                  {z.jmeno}
                </Link>
                <span className="text-sm text-text-tlumeny">
                  {z.zakazek === 0 ? "bez zakázek" : `zakázky: ${z.zakazek}`}
                </span>
              </div>
              <p className="text-sm break-words text-text-tlumeny">
                {[z.ico && `IČO ${z.ico}`, z.telefon, z.adresa].filter(Boolean).join(" · ") ||
                  "bez kontaktu"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Stranka>
  );
}
