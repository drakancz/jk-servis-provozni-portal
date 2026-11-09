/**
 * Content-Security-Policy (krok 1B, jako v CRM): prohlížeč spustí jen
 * skripty s jednorázovým klíčem (`nonce`), který server vymyslí pro každé
 * načtení stránky. Kdyby se do stránky přes chybu dostal cizí skript
 * (třeba v názvu zakázky z importovaného Excelu), prohlížeč ho nespustí
 * a data nepošle nikam jinam než na náš server.
 *
 * Postup podle `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`:
 * klíč vzniká v `src/proxy.ts`, Next.js ho doplní na své skripty. Stránky
 * se proto vykreslují až na požádání (kořenový rám čte hlavičky).
 *
 * Styly mají `'unsafe-inline'` — Next.js a React je občas nastavují přímo
 * na prvcích; přes styl se skript spustit nedá.
 */

export function novyNonce(): string {
  const bajty = new Uint8Array(16);
  crypto.getRandomValues(bajty);
  return btoa(String.fromCharCode(...bajty));
}

export function hlavickaCsp({
  nonce,
  vyvoj,
  https,
}: {
  nonce: string;
  /** `next dev` potřebuje `eval` a websocket pro obnovu stránky. */
  vyvoj: boolean;
  /** Jen na https se smí vynutit https u všeho načítaného. */
  https: boolean;
}): string {
  const pravidla: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(vyvoj ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(vyvoj ? ["ws:", "wss:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const text = Object.entries(pravidla).map(([klic, hodnoty]) => `${klic} ${hodnoty.join(" ")}`);
  if (https) text.push("upgrade-insecure-requests");
  return text.join("; ");
}
