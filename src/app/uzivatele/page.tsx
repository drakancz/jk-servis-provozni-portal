import type { Metadata } from "next";

import { vyzadujRoli } from "@/lib/sezeni";
import { NAZEV_ROLE, seznamUzivatelu } from "@/lib/uzivatele";

import { Hlavicka } from "../hlavicka";
import { NovyUzivatel, RadekUzivatele } from "./sprava";

export const metadata: Metadata = { title: "Uživatelé" };
export const dynamic = "force-dynamic";

const DATUM = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", dateStyle: "medium" });

/**
 * Uživatelé (krok 1C). Oprávnění (Jakub, 8. 11. 2026):
 * - vidí a mění **jen Majitel**; Dispečer a Technik dostanou 404,
 * - nepřihlášený jde na přihlášení.
 * Heslo za nikoho nezadává — jen předá jednorázový odkaz.
 */
export default async function StrankaUzivatelu() {
  const ja = await vyzadujRoli("MAJITEL");
  const uzivatele = await seznamUzivatelu();
  const aktivni = uzivatele.filter((u) => !u.zruseno);
  const zrusene = uzivatele.filter((u) => u.zruseno);

  return (
    <div className="min-h-dvh">
      <Hlavicka uzivatel={ja} aktivni="uzivatele" />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
        <div>
          <p className="text-sm font-semibold tracking-wide text-zvyrazneni uppercase">
            JK servis s.r.o.
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Uživatelé</h1>
          <p className="mt-2 max-w-prose text-text-tlumeny">
            Účet založíte jménem, e-mailem a rolí. Portál pak ukáže jednorázový odkaz, který předáte
            sami (SMS, osobně). Heslo si člověk nastaví sám a nikdo jiný ho nezná.
          </p>
        </div>

        <NovyUzivatel />

        <section aria-labelledby="aktivni" className="flex flex-col gap-3">
          <h2 id="aktivni" className="text-xl font-bold">
            Aktivní účty ({aktivni.length})
          </h2>
          <ul className="flex flex-col gap-3">
            {aktivni.map((u) => (
              <RadekUzivatele
                key={u.id}
                uzivatel={{
                  id: u.id,
                  jmeno: u.jmeno,
                  email: u.email,
                  role: u.role,
                  maHeslo: u.maHeslo,
                  odkazPlatiDo: u.odkazPlatiDo?.toISOString() ?? null,
                }}
                jsemTo={u.id === ja.id}
              />
            ))}
          </ul>
        </section>

        {zrusene.length > 0 && (
          <section aria-labelledby="zrusene" className="flex flex-col gap-3">
            <h2 id="zrusene" className="text-xl font-bold">
              Zrušené účty ({zrusene.length})
            </h2>
            <p className="text-sm text-text-tlumeny">
              Přihlásit se nemohou; zůstávají kvůli historii zakázek.
            </p>
            <ul className="flex flex-col divide-y divide-okraj rounded-lg border border-okraj bg-povrch">
              {zrusene.map((u) => (
                <li key={u.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <span>
                    <span className="font-medium">{u.jmeno}</span>{" "}
                    <span className="text-text-tlumeny">· {NAZEV_ROLE[u.role]}</span>
                  </span>
                  <span className="text-sm text-text-tlumeny">
                    zrušeno {DATUM.format(u.zruseno!)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
