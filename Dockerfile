# syntax=docker/dockerfile:1

# Node 24.22.2 je aktuální LTS (ověřeno 7. 11. 2026). Verze je zafixovaná
# stejně jako balíčky v package.json, aby všem běželo přesně totéž.
ARG NODE_IMAGE=node:24.22.2-trixie-slim

# ---------- společný základ ----------
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Prisma (od kroku 1B) potřebuje ke spojení s databází OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---------- závislosti ----------
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ---------- vývoj ----------
# Kód se při běžné práci připojí z disku (compose.yaml).
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- sestavení produkční verze ----------
# NODE_ENV se záměrně nenastavuje — next build si ho nastaví sám.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Klient Prismy se generuje z schématu; databáze při sestavení neběží,
# adresa je jen zjevně falešná zástupná hodnota.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
RUN npm run build

# ---------- produkční běh ----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Aplikace nikdy neběží pod rootem.
RUN groupadd --system --gid 1001 nextjs \
    && useradd --system --uid 1001 --gid nextjs nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
