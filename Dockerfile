# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS build
ENV NODE_OPTIONS=--max-old-space-size=384 \
    npm_config_jobs=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev \
    && npm cache clean --force

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/app/storage/uploads \
    RUN_MIGRATIONS=true

RUN apk add --no-cache dumb-init \
    && addgroup -S api \
    && adduser -S api -G api

COPY --from=build --chown=api:api /app/node_modules ./node_modules
COPY --from=build --chown=api:api /app/dist ./dist
COPY --chown=api:api package.json package-lock.json ./
COPY --chown=api:api prisma ./prisma
COPY --chown=api:api docker-entrypoint.sh ./docker-entrypoint.sh

RUN sed -i 's/\r$//' ./docker-entrypoint.sh \
    && chmod +x ./docker-entrypoint.sh \
    && mkdir -p /app/storage/uploads/booking-requests \
    && chown -R api:api /app/storage

USER api
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
