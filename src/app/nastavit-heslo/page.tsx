import type { Metadata } from "next";
import Link from "next/link";

import { platnyOdkaz } from "@/lib/uzivatele";

import { FormularHesla } from "./formular";

export const metadata: Metadata = { title: "Nastavit heslo" };
export const dynamic = "force-dynamic";

/**
 * Nastavení hesla z odkazu od majitele (krok 1C). Veřejná stránka
 * (Jakub, 8. 11. 2026) — prokazuje se jen tokenem v odkazu. Neplatný,
 * použitý i propadlý odkaz dostane stejnou hlášku (nic se z ní nevyčte).
 */
export default async function StrankaHesla({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const odkaz = token ? await platnyOdkaz(token) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-semibold tracking-wide text-zvyrazneni uppercase">
          JK servis s.r.o.
        </p>
        <h1 className="mt-2 text-3xl font-bold">Nastavit heslo</h1>
      </div>
      {odkaz ? (
        <>
          <p className="text-text-tlumeny">
            Účet: <span className="font-medium text-text">{odkaz.user.name}</span>. Zvolte si heslo
            o délce aspoň 12 znaků; zná ho jen vy.
          </p>
          <FormularHesla token={token} />
        </>
      ) : (
        <div className="rounded-lg border border-okraj bg-povrch p-5">
          <p className="font-medium">Odkaz už neplatí.</p>
          <p className="mt-1 text-text-tlumeny">
            Odkaz platí 24 hodin a jen jednou. Požádejte majitele firmy o nový.
          </p>
          <Link href="/prihlaseni" className="mt-3 inline-block font-medium text-hlavni underline">
            Na přihlášení
          </Link>
        </div>
      )}
    </main>
  );
}
