# ---- Base image ----
FROM node:20.18.0-alpine AS base

# ---- Install dependencies ----
FROM base AS deps
WORKDIR /app
RUN npm install -g npm@latest
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund \
    && test -f node_modules/.bin/next || (echo "next binary missing after install" && exit 1)

# ---- Build the app ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Run the app ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
