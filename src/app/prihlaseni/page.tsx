import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prihlaseny } from "@/lib/sezeni";
import { jeUkazka } from "@/lib/ukazka";

import { PruhUkazky } from "../pruh-ukazky";

import { FormularPrihlaseni } from "./formular";
import { UkazkoveUcty } from "./ukazkove-ucty";

export const metadata: Metadata = { title: "Přihlášení" };
export const dynamic = "force-dynamic";

/**
 * Přihlášení (krok 1B). Jediná stránka pro nepřihlášené (zadání, Jakub
 * 7. 11. 2026). Kdo už přihlášený je, jde rovnou do portálu.
 */
export default async function StrankaPrihlaseni({
  searchParams,
}: {
  searchParams: Promise<{ heslo?: string | string[] }>;
}) {
  if (await prihlaseny()) redirect("/");
  // Po nastavení hesla z odkazu (krok 1C) jen potvrzení, žádná data.
  const hesloNastaveno = (await searchParams).heslo === "nastaveno";

  const ukazka = jeUkazka();

  return (
    <>
      <PruhUkazky />
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
        <div>
          <p className="text-sm font-semibold tracking-wide text-zvyrazneni uppercase">
            JK servis s.r.o.
          </p>
          <h1 className="mt-2 text-3xl font-bold">Provozní portál</h1>
          <p className="mt-2 text-text-tlumeny">
            Přihlaste se e-mailem a heslem. Účet vám založí majitel firmy.
          </p>
        </div>
        {hesloNastaveno && (
          <p
            role="status"
            className="rounded-md border border-hlavni bg-povrch px-4 py-3 font-medium"
          >
            Heslo je nastavené. Teď se můžete přihlásit.
          </p>
        )}
        {/* Ukázka (krok 5A): účty se známým heslem jen s UKAZKA=1. */}
        {ukazka && <UkazkoveUcty />}
        <FormularPrihlaseni />
      </main>
    </>
  );
}
