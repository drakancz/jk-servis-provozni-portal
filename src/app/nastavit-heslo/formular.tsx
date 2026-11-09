"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { nastavHeslo } from "./akce";

const POLE = "rounded-md border border-okraj bg-pozadi px-3 py-2";

export function FormularHesla({ token }: { token: string }) {
  const router = useRouter();
  const [chyba, setChyba] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);

  async function odeslat(udalost: FormEvent<HTMLFormElement>) {
    udalost.preventDefault();
    const data = new FormData(udalost.currentTarget);
    setChyba(null);
    setOdesila(true);
    const odpoved = await nastavHeslo({
      token,
      heslo: String(data.get("heslo") ?? ""),
      znovu: String(data.get("znovu") ?? ""),
    });
    if (!odpoved.ok) {
      setOdesila(false);
      setChyba(odpoved.chyba);
      return;
    }
    router.replace("/prihlaseni?heslo=nastaveno");
  }

  return (
    <form
      onSubmit={odeslat}
      className="flex flex-col gap-4 rounded-lg border border-okraj bg-povrch p-5"
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">Nové heslo</span>
        <input
          name="heslo"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          className={POLE}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Heslo znovu</span>
        <input
          name="znovu"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          className={POLE}
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
        {odesila ? "Ukládám…" : "Nastavit heslo"}
      </button>
    </form>
  );
}
