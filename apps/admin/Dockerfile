# Built from the repo root (`docker build -f apps/admin/Dockerfile .`), not
# this directory — same reason as apps/web/Dockerfile: needs the whole
# pnpm workspace for the @bewerber/shared dependency.

FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bewerber/shared build
RUN pnpm --filter admin build

FROM nginx:1.27-alpine AS runtime
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
