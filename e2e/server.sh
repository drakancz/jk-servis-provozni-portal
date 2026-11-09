#!/bin/sh
# Aplikace pro automatické testy. Spouští ji Playwright (playwright.config.ts).
# Průběh jde na stderr — Playwright ukazuje jen ten.
set -e

case "$DATABASE_URL" in
  */portal_test | */portal_test_ukazka) ;;
  *)
    echo "Testovací server smí běžet jen nad databází portal_test (nebo portal_test_ukazka)." >&2
    exit 1
    ;;
esac

# Čistá databáze: smazat, projít migrace, naplnit ukázkovými účty s heslem
# z SEED_HESLO (vymýšlí ho playwright.config.ts pro každý běh).
# Prisma se jinak při každém příkazu ptá internetu na novou verzi (v CRM to
# na pomalém spojení zasekávalo přípravu). Každý krok má lhůtu.
export CHECKPOINT_DISABLE=1
export PRISMA_HIDE_UPDATE_MESSAGE=1
echo "[příprava] připravuji databázi portal_test…" >&2
timeout 180 npx prisma generate >&2
timeout 180 npx prisma migrate reset --force >&2
# Ukázkový režim (UKAZKA=1) si data naplní sám při prvním otevření dne.
if [ "$UKAZKA" != "1" ]; then
  timeout 180 npx prisma db seed >&2
fi

# Tajemství přihlášení jen pro tento běh.
BETTER_AUTH_SECRET=$(head -c 32 /dev/urandom | base64)
export BETTER_AUTH_SECRET
PORT_APLIKACE="${PORT_APLIKACE:-3100}"
export BETTER_AUTH_URL="http://localhost:$PORT_APLIKACE"

# Na GitHubu (E2E_PRODUKCE=1) se testuje produkční sestavení, jako běží
# na Railway. Doma next dev, ať se změny dají zkoušet bez sestavení.
if [ "$E2E_PRODUKCE" = "1" ]; then
  echo "[příprava] sestavuji produkční verzi…" >&2
  npx next build >&2
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public
  echo "[příprava] spouštím produkční aplikaci na portu 3100…" >&2
  cd .next/standalone
  PORT=$PORT_APLIKACE HOSTNAME=0.0.0.0 NODE_ENV=production exec node server.js
fi

echo "[příprava] spouštím aplikaci na portu 3100…" >&2
exec npx next dev --port "$PORT_APLIKACE"
