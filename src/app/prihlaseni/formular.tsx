"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authKlient } from "@/lib/auth-klient";

/**
 * Kam po přihlášení. Jen cesta v rámci portálu — „//cizi.cz“ nebo celá
 * adresa by z formuláře udělaly odrazový můstek na cizí web.
 */
function bezpecnaCesta(zpet: string | null): string {
  if (!zpet || !zpet.startsWith("/") || zpet.startsWith("//") || zpet.includes("\\")) return "/";
  return zpet;
}

export function FormularPrihlaseni() {
  const router = useRouter();
  const parametry = useSearchParams();
  const [chyba, setChyba] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);

  async function odeslat(udalost: FormEvent<HTMLFormElement>) {
    udalost.preventDefault();
    const data = new FormData(udalost.currentTarget);
    setChyba(null);
    setOdesila(true);

    const { error } = await authKlient.signIn.email({
      email: String(data.get("email") ?? "").trim(),
      password: String(data.get("heslo") ?? ""),
    });

    if (error) {
      setOdesila(false);
      setChyba(
        error.status === 429
          ? "Příliš mnoho pokusů o přihlášení. Zkuste to znovu za 15 minut."
          : "Nesprávný e-mail nebo heslo.",
      );
      return;
    }

    router.replace(bezpecnaCesta(parametry.get("zpet")));
    router.refresh();
  }

  return (
    <form
      onSubmit={odeslat}
      className="flex flex-col gap-4 rounded-lg border border-okraj bg-povrch p-5"
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">E-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          className="rounded-md border border-okraj bg-pozadi px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Heslo</span>
        <input
          name="heslo"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className="rounded-md border border-okraj bg-pozadi px-3 py-2"
        />
      </label>
      {chyba && (
        <p role="alert" className="font-medium text-chyba">
          {chyba}
        </p>
      )}
      <button
        type="submit"
        disabled={odesila}
        className="rounded-md bg-hlavni px-4 py-2 font-semibold text-hlavni-text disabled:cursor-wait"
      >
        {odesila ? "Přihlašuji…" : "Přihlásit se"}
      </button>
    </form>
  );
}
