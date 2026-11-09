import type { Metadata } from "next";
import Link from "next/link";

import { vyzadujRoli } from "@/lib/sezeni";

import { Stranka } from "../../stranka";
import { KARTA } from "../../styly";
import { FormularZakaznika } from "../formular";

export const metadata: Metadata = { title: "Nový zákazník" };
export const dynamic = "force-dynamic";

/** Založení zákazníka (krok 2A): Majitel a Dispečer, Technik 404. */
export default async function NovyZakaznik() {
  const uzivatel = await vyzadujRoli("MAJITEL", "DISPECER");
  return (
    <Stranka
      uzivatel={uzivatel}
      aktivni="zakaznici"
      nadNadpisem={
        <Link href="/zakaznici" className="underline-offset-4 hover:underline">
          ← Zákazníci
        </Link>
      }
      nadpis="Nový zákazník"
    >
      <section aria-label="Údaje zákazníka" className={KARTA}>
        <FormularZakaznika />
      </section>
    </Stranka>
  );
}
