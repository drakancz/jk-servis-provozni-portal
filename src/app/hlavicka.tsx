import Link from "next/link";

import type { Prihlaseny } from "@/lib/sezeni";
import { NAZEV_ROLE } from "@/lib/uzivatele";

import { odhlasit } from "./akce-prihlaseni";

export type Sekce = "zakazky" | "zakaznici" | "cenik" | "import" | "uzivatele" | "prehled";

/**
 * Hlavička přihlášené části. Přehled, Zákazníky, Ceník a Import vidí Majitel a Dispečer, Uživatele
 * jen Majitel — je to úklid, ne ochrana: stránka i akce si roli ověřují samy.
 */
export function Hlavicka({ uzivatel, aktivni }: { uzivatel: Prihlaseny; aktivni: Sekce }) {
  const odkazy = [
    { href: "/", nazev: "Zakázky", id: "zakazky" },
    ...(uzivatel.role !== "TECHNIK"
      ? [
          { href: "/prehled", nazev: "Přehled", id: "prehled" },
          { href: "/zakaznici", nazev: "Zákazníci", id: "zakaznici" },
          { href: "/cenik", nazev: "Ceník", id: "cenik" },
          { href: "/import", nazev: "Import", id: "import" },
        ]
      : []),
    ...(uzivatel.role === "MAJITEL"
      ? [{ href: "/uzivatele", nazev: "Uživatelé", id: "uzivatele" }]
      : []),
  ];
  return (
    <header className="border-b border-okraj bg-povrch">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="font-bold">Provozní portál</p>
          <nav
            aria-label="Hlavní menu"
            className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium"
          >
            {odkazy.map((o) => (
              <Link
                key={o.id}
                href={o.href}
                aria-current={o.id === aktivni ? "page" : undefined}
                className="underline-offset-4 hover:underline aria-[current=page]:text-hlavni aria-[current=page]:underline"
              >
                {o.nazev}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text-tlumeny">
            {uzivatel.name} · {NAZEV_ROLE[uzivatel.role]}
          </p>
          <form action={odhlasit}>
            <button
              type="submit"
              className="rounded-md border border-okraj px-3 py-1.5 text-sm font-medium"
            >
              Odhlásit
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
