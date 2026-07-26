# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
#  Базис — образ приложения.
#  Три стадии: зависимости → сборка → рантайм. В финальный образ
#  попадает только собранный server.js и то, что ему реально нужно.
# ─────────────────────────────────────────────────────────────

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Приложение отказывается стартовать в продакшене без SESSION_SECRET.
# На сборке подставляем заглушку — в финальный образ она НЕ попадает,
# стадии не наследуют ENV друг друга. Значит забытый секрет на рантайме
# всё так же уронит контейнер, а не пропустит дырявую сборку.
ENV SESSION_SECRET=build-stage-placeholder-never-reaches-runtime
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# SQL миграций: приложение применяет их при старте
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
