# Built from the repo root (`docker build -f apps/api/Dockerfile .`), not
# this directory — the API depends on the @bewerber/shared workspace
# package, so the build context needs the whole pnpm workspace, not just
# this app.

FROM node:22-slim AS base
# argon2 (password hashing) has a native addon — pnpm's allowBuilds
# entry for it expects to run a real build step during install, not just
# download a prebuilt binary.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

FROM base AS build
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bewerber/shared build
RUN pnpm --filter api build
# pnpm's own recommended pattern for a workspace package + Docker: copies
# the built dist/ plus a pruned, self-contained node_modules (prod deps
# only, workspace deps like @bewerber/shared inlined as real files, not
# symlinks) into one standalone directory.
RUN pnpm --filter api deploy --prod --legacy /out/api
# `pnpm deploy` packs files using npm's legacy pack-ignore list, which
# always drops any directory literally named "cvs" (case-insensitive) —
# a holdover exclusion for old CVS version-control metadata dirs. That
# silently drops our src/cvs module's compiled output, so copy it back in
# from the untouched build-stage dist.
RUN cp -r apps/api/dist/cvs /out/api/dist/cvs

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
