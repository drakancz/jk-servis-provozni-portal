import { defineConfig, env } from "prisma/config";

/**
 * Konfigurace Prismy 7 (jako v CRM). Připojovací adresa se čte z prostředí,
 * aby se heslo k databázi nikdy nedostalo do repozitáře.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // docker compose run --rm web npm run db:seed
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
