import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Stránka nenalezena" };

/**
 * Česká stránka „nenalezeno“ (krok 5B) — místo výchozí anglické hlášky
 * Next.js. Dostane ji i ten, kdo na záznam nemá právo (pravidlo 404, ne
 * „nemáte oprávnění“), proto neříká nic o tom, co by na adrese mohlo být.
 */
export default function Nenalezeno() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-semibold tracking-wide text-zvyrazneni uppercase">
          JK servis s.r.o.
        </p>
        <h1 className="mt-2 text-3xl font-bold">Stránka nenalezena</h1>
      </div>
      <div className="rounded-lg border border-okraj bg-povrch p-5">
        <p>Na této adrese nic není, nebo k tomu nemáte přístup.</p>
        <Link href="/" className="mt-3 inline-block font-medium text-hlavni underline">
          Zpět na zakázky
        </Link>
      </div>
    </main>
  );
}
