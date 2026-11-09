import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { hlavickaCsp, novyNonce } from "@/lib/csp";

/**
 * Každá stránka dostane Content-Security-Policy (`src/lib/csp.ts`)
 * a nepřihlášený návštěvník se rovnou odbočí na přihlášení.
 *
 * **Odbočení není bezpečnostní opatření** — kontroluje se jen to, jestli
 * cookie se sezením vůbec existuje. Platnost ověřuje až server
 * (`vyzadujPrihlaseni()` v `src/lib/sezeni.ts`), který je na prvním řádku
 * každé chráněné stránky. Bez tohohle souboru by aplikace zůstala
 * bezpečná, jen by nepřihlášený čekal o chvíli déle.
 */

// Nastavení hesla z odkazu je veřejné (krok 1C) — prokazuje se tokenem.
const VEREJNE = ["/prihlaseni", "/nastavit-heslo"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const verejna = VEREJNE.some((c) => pathname === c || pathname.startsWith(`${c}/`));

  if (!verejna && !getSessionCookie(request)) {
    const cil = new URL("/prihlaseni", request.url);
    if (pathname !== "/" || search) cil.searchParams.set("zpet", pathname + search);
    return NextResponse.redirect(cil);
  }

  const nonce = novyNonce();
  const csp = hlavickaCsp({
    nonce,
    vyvoj: process.env.NODE_ENV === "development",
    https: process.env.BETTER_AUTH_URL?.startsWith("https://") ?? false,
  });

  // Klíč do hlavičky požadavku (odtud si ho vezme Next.js) i odpovědi
  // (podle ní se řídí prohlížeč).
  const hlavicky = new Headers(request.headers);
  hlavicky.set("x-nonce", nonce);
  hlavicky.set("Content-Security-Policy", csp);
  const odpoved = NextResponse.next({ request: { headers: hlavicky } });
  odpoved.headers.set("Content-Security-Policy", csp);
  return odpoved;
}

export const config = {
  // Rozhraní (`/api`), soubory Next.js a ikony proxy nepotřebují.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|txt)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
