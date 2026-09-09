# BewerbungsHub

A self-hosted job application tracker: log every application, follow its
pipeline from draft to offer, and let Gmail tell you when a rejection or
interview invite comes in — instead of tracking any of it by hand.

## Features

- **Application tracking** — kanban board and list views, duplicate-application
  detection, related links, notes, tags, favorites, CV attachments.
- **Interviews & follow-ups** — schedule interviews, set follow-up reminders,
  get flagged when one goes overdue.
- **Gmail sync** — connects to your Gmail account, polls a configurable
  sender allowlist (LinkedIn, Lever, SmartRecruiters, join.com,
  DigitalRecruiters, onlyfy) for rejection/interview keywords, and either
  auto-applies the status change or queues it for manual approval. Emails
  it can classify but can't tie to a tracked application land in a
  dedicated "unmatched" list instead of being silently dropped.
  Built on BullMQ + Redis for scheduled background polling.
- **CV storage** — upload PDF or DOCX, stored locally, in S3-compatible
  storage, or in the user's own Google Drive (opens in Drive's native
  viewer when Drive-backed).
- **Browser extension** — a Chrome extension that captures the job posting
  you're viewing (LinkedIn, Indeed, StepStone, XING, AMS, and generic
  pages via JSON-LD/microdata/heuristic fallback) and saves it straight
  into the tracker.
- **Admin panel** — a separate app for approving new registrations,
  locking/unlocking accounts, and viewing system-wide stats.
- **MCP server** — exposes application data as tools for AI clients (e.g.
  Claude) via the Model Context Protocol.
- **Dashboard** — sent-today/sent-this-week counts, response rate, average
  time to first response, status/apply-type breakdowns, overdue follow-ups.
- Bilingual UI (English/German).

## Monorepo structure

```
apps/
  api/         NestJS API — auth, applications, CVs, Gmail sync, admin
  web/         React app — the main job-seeker UI
  admin/       React app — the admin panel
  extension/   Chrome extension (MV3) — capture widget + job-posting scrapers
  mcp/         MCP server — exposes application data as tools for AI clients
packages/
  shared/      Zod schemas and TypeScript types shared across apps
  scrapers/    Per-site job-posting extraction logic used by the extension
```

## Tech stack

- **API**: NestJS, Mongoose (MongoDB), BullMQ + Redis, Zod, Passport/JWT,
  Argon2, Resend (email), AWS S3 SDK, Google APIs (Drive + Gmail).
- **Web/Admin/Extension**: React, Vite, Tailwind CSS, TanStack Query,
  React Hook Form, react-i18next, Recharts.
- **Tooling**: pnpm workspaces, Turborepo, TypeScript, Jest (API), Vitest
  (web/admin/extension), ESLint/oxlint, Prettier, Husky + lint-staged +
  commitlint.

## Getting started

Prerequisites: Node.js 20+, pnpm, Docker (for local Mongo/Redis/MinIO).

```bash
git clone https://github.com/jalalsaghaybolghari/bewerbungshub.git
cd bewerbungshub
pnpm install

# Start local Mongo, Redis, MinIO (S3-compatible storage), and mongo-express
docker compose up -d

# Copy the env template and fill in the values you need
cp .env.example .env

pnpm dev
```

See `.env.example` for every environment variable, including which ones
are optional (Google Drive/Gmail integration, S3 vs. local file storage)
and how to generate the secrets it asks for.

## Scripts

Run from the repo root (via Turborepo, across all apps/packages):

```bash
pnpm dev      # start every app in dev mode
pnpm build    # build everything
pnpm lint     # lint everything
pnpm test     # run every test suite
```

## License

[MIT](LICENSE)
