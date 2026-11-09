import type { Metadata } from "next";
import Link from "next/link";

import { vyzadujRoli } from "@/lib/sezeni";
import { idSchema } from "@/lib/uzivatele";
import { vyberZakazniku } from "@/lib/zakaznici";

import { Stranka } from "../../stranka";
import { KARTA } from "../../styly";
import { FormularZakazky } from "../formular";

export const metadata: Metadata = { title: "Nová zakázka" };
export const dynamic = "force-dynamic";

/**
 * Založení zakázky (krok 2A): Majitel a Dispečer, Technik 404.
 * `?zakaznik=…` předvybere zákazníka (z jeho karty); neznámé id se ignoruje.
 */
export default async function NovaZakazka({ searchParams }: PageProps<"/zakazky/nova">) {
  const uzivatel = await vyzadujRoli("MAJITEL", "DISPECER");
  const zakaznici = await vyberZakazniku();
  const predvybrany = idSchema.safeParse((await searchParams).zakaznik);
  const zakaznik = predvybrany.success
    ? zakaznici.find((z) => z.id === predvybrany.data)
    : undefined;

  return (
    <Stranka
      uzivatel={uzivatel}
      aktivni="zakazky"
      nadNadpisem={
        <Link href="/" className="underline-offset-4 hover:underline">
          ← Zakázky
        </Link>
      }
      nadpis="Nová zakázka"
      popis="Číslo zakázky přidělí portál sám. Přidělení technikovi přibude v dalším kroku."
    >
      <section aria-label="Údaje zakázky" className={KARTA}>
        <FormularZakazky
          zakaznici={zakaznici}
          puvodni={
            zakaznik
              ? { zakaznikId: zakaznik.id, misto: zakaznik.address ?? "", popis: "", termin: "" }
              : undefined
          }
        />
      </section>
    </Stranka>
  );
}
