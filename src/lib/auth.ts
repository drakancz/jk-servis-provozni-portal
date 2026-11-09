import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";

/**
 * Přihlášení (krok 1B, Jakub 7. 11. 2026): Better Auth 1.7, e-mail a heslo.
 *
 * - **Veřejná registrace neexistuje** (`disableSignUp`). Účty zakládá
 *   Majitel na obrazovce Uživatelé (krok 1C, `src/lib/uzivatele.ts`).
 * - **Omezení pokusů:** 5 přihlášení za 15 minut z jedné adresy, počítá se
 *   v databázi (vydrží restart). Adresu bere z `x-real-ip` (nastavuje
 *   proxy Railway), jinak z `x-forwarded-for`.
 * - **Zapomenuté heslo není** — ukázka neposílá žádné e-maily ven.
 * - **Zrušený účet** (`deletedAt`) se nepřihlásí: sezení se nezaloží.
 *
 * Tajemství `BETTER_AUTH_SECRET` a adresa `BETTER_AUTH_URL` jsou jen
 * v prostředí: ve vývoji je vymyslí `compose.yaml` při každém startu,
 * v testech `e2e/server.sh`, na Railway je nastaví Jakub.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },

  user: {
    additionalFields: {
      // `input: false` — roli ani zrušení nejde poslat zvenku přes API.
      role: {
        type: ["MAJITEL", "DISPECER", "TECHNIK"],
        required: true,
        defaultValue: "TECHNIK",
        input: false,
      },
      deletedAt: { type: "date", required: false, input: false },
    },
  },

  session: {
    // Přihlášení vydrží týden, s každým dnem používání se prodlouží.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 5 },
    },
  },

  advanced: {
    ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
  },

  databaseHooks: {
    session: {
      create: {
        async before(sezeni) {
          const uzivatel = await db.user.findUnique({
            where: { id: sezeni.userId },
            select: { deletedAt: true },
          });
          // `false` = sezení nevznikne, přihlášení selže.
          if (!uzivatel || uzivatel.deletedAt) return false;
        },
      },
    },
  },

  telemetry: { enabled: false },

  // Server akce (odhlášení) nastaví cookie přes next/headers.
  plugins: [nextCookies()],
});
