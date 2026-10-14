# syntax=docker/dockerfile:1

# ---- build: install everything, generate the Prisma client, compile TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
# Swagger UI's install-time telemetry is not wanted in bank infrastructure.
ENV SCARF_ANALYTICS=false
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- migrate: one-off job that applies migrations (needs the Prisma CLI, a dev dependency) ----
FROM build AS migrate
RUN npm install --no-save prisma@7.10.0
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- runtime: production dependencies and compiled output only, as a non-root user ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]
