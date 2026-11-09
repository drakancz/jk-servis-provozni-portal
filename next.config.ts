import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produkční obraz nese jen to, co je opravdu potřeba — bez node_modules.
  output: "standalone",

  // Vývojářský odznak Next.js v rohu si zájemce splete s aplikací.
  devIndicators: false,

  // Neprozrazovat, na čem aplikace běží.
  poweredByHeader: false,

  // Import z Excelu (krok 3A): soubor do 2 MB + režie formuláře. Výchozí
  // limit serverových akcí je 1 MB; velikost hlídá i akce sama.
  experimental: {
    serverActions: { bodySizeLimit: "2100kb" },
  },

  /*
   * Bezpečnostní hlavičky pro všechny odpovědi (stejně jako v CRM):
   * zákaz vložení do cizí stránky, prohlížeč nehádá typ souboru, cizí web
   * se nedozví adresu stránky, kamera ani mikrofon se nepoužívají.
   * Content-Security-Policy s jednorázovým klíčem nastavuje `src/proxy.ts`
   * (krok 1B); tady zůstává jen zákaz vložení do cizí stránky pro adresy,
   * přes které proxy nejde (`/api`, soubory).
   */
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
