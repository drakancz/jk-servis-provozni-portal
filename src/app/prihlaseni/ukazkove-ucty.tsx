"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authKlient } from "@/lib/auth-klient";
import { NAZEV_ROLE } from "@/lib/role";
import { HESLO_UKAZKY, UKAZKOVE_UCTY } from "@/lib/ukazka";

import { HLAVNI } from "../styly";

const CO_VIDI: Record<(typeof UKAZKOVE_UCTY)[number]["role"], string> = {
  MAJITEL: "všechno včetně ceníku, přehledu a uživatelů",
  DISPECER: "zakládá a přiděluje zakázky, import z Excelu",
  TECHNIK: "jen své zakázky a výkaz — zkuste na telefonu",
};

/**
 * Přihlášení do ukázky jedním klikem (krok 5A, Jakub 9. 11. 2026). Heslo
 * je veřejné schválně — data jsou vymyšlená. Ukazuje se jen s `UKAZKA=1`
 * (rozhoduje přihlašovací stránka na serveru).
 */
export function UkazkoveUcty() {
  const router = useRouter();
  const [chyba, setChyba] = useState<string | null>(null);
  const [kdo, setKdo] = useState<string | null>(null);

  async function prihlasit(email: string) {
    setChyba(null);
    setKdo(email);
    const { error } = await authKlient.signIn.email({ email, password: HESLO_UKAZKY });
    if (error) {
      setKdo(null);
      setChyba(
        error.status === 429
          ? "Příliš mnoho pokusů o přihlášení. Zkuste to znovu za 15 minut."
          : "Přihlášení se nepovedlo. Obnovte stránku a zkuste to znovu.",
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <section
      aria-labelledby="ukazka"
      className="flex flex-col gap-3 rounded-lg border border-hlavni bg-povrch p-5"
    >
      <h2 id="ukazka" className="text-lg font-bold">
        Vyzkoušejte si portál
      </h2>
      <ul className="flex flex-col gap-3">
        {UKAZKOVE_UCTY.map((u) => (
          <li key={u.email} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => prihlasit(u.email)}
              disabled={kdo !== null}
              className={HLAVNI}
            >
              {kdo === u.email ? "Přihlašuji…" : `Vyzkoušet jako ${NAZEV_ROLE[u.role]}`}
            </button>
            <span className="text-sm text-text-tlumeny">
              {u.name} — {CO_VIDI[u.role]}
            </span>
          </li>
        ))}
      </ul>
      {chyba && (
        <p role="alert" className="font-medium text-chyba">
          {chyba}
        </p>
      )}
      <p className="text-sm text-text-tlumeny">
        Nebo se přihlaste ručně: e-mail <code>{UKAZKOVE_UCTY[0].email}</code> (případně dispecer@ /
        technik@) a heslo <code>{HESLO_UKAZKY}</code>.
      </p>
    </section>
  );
}
