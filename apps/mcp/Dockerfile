# Built from the repo root (`docker build -f apps/mcp/Dockerfile .`), not
# this directory — depends on the @bewerber/shared workspace package, so
# the build context needs the whole pnpm workspace, not just this app.

FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

FROM base AS build
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bewerber/shared build
RUN pnpm --filter mcp build
RUN pnpm --filter mcp deploy --prod --legacy /out/mcp

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/mcp ./
EXPOSE 3002
CMD ["node", "dist/main.js"]
