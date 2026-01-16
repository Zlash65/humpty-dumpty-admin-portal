# Humpty Dumpty Admin Portal

Web-based admin portal for school management (students, fees, classes, staff, transport, enrollment, branches, academic years, settings, audit log) backed by **PostgreSQL**.

This repo also includes a migration pipeline to move data from the legacy Electron app’s **SQLite** database (`school.db`) into Postgres.

## Tech Stack

- Next.js App Router (Next `16.1.1`)
- React `19`
- MUI `v7` + MUI X DataGrid `v8`
- Postgres (schema bootstrap + migration scripts)
- Prisma (client generation + optional usage)

## Prerequisites

- Node.js (recommended: latest LTS)
- Postgres (local or hosted)
- (Optional) `better-sqlite3` for SQLite → Postgres migration

## Getting Started (Dev)

```bash
npm install
cp .env.example .env
```

Then configure environment variables (see below), create your Postgres database, and run:

```bash
# Creates tables/indexes (idempotent; safe to run multiple times)
npm run db:setup

# Start dev server
npm run dev
```

Open `http://localhost:3000`.

### Environment variables

This app reads server-side configuration from environment variables.

- **Next.js runtime** loads `.env.local` and `.env`.
- **Node scripts** (schema setup/migration/verification) also read `.env.local` and `.env`.

At minimum you should set:

- `DATABASE_URL` — Postgres connection string
- `AUTH_SECRET` — required in production (signs auth cookies)
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — auto-seeds an admin user on first access (see `lib/seed.ts`)
- `ADMIN_PASSWORD_FORCE_UPDATE=1` — (optional) forces password update on boot if it differs

## Auth Model (Production Notes)

- Login sets a signed `auth_token` cookie (HTTP-only).
- Requests are gated at the edge of the app using **Next.js 16 `proxy.ts`** and re-checked in sensitive routes/layout for defense-in-depth.
- In production, set a strong `AUTH_SECRET` and ensure HTTPS (`secure` cookies).

## UI / Data Grid Conventions

This codebase standardizes on server-backed tables and searchable selects to stay fast as data grows.

### Tables (server paginated)

- Use `StandardDataGrid` + `useServerPaginatedGrid`.
- “Export All” is implemented via `app/api/export/[entity]/route.ts`.
- Printing from server-paginated views must be pagination-aware (fetch all filtered rows with a safe cap).

### Search UX

- Search inputs use debounced, server-backed search (`minChars=2`, `debounceMs=300`).
- Large option sets use async searchable dropdowns instead of shipping huge lists to the client.

## Database Setup + Migration (SQLite → Postgres)

If you’re migrating from the Electron app’s SQLite database (`school.db`), run:

```bash
# 1) Create tables/indexes in Postgres (safe to run multiple times)
npm run db:setup

# 2) Migrate SQLite data into Postgres
npm run migrate:sqlite -- /path/to/school.db

# 3) Verify counts + integrity
npm run verify:migration -- /path/to/school.db
```

Notes:

- `npm run migrate:sqlite` requires SQLite access. `better-sqlite3` is listed as an optional dependency; if your environment can’t build it, install it separately or run migration from a compatible machine.

## Production Build

```bash
npm run build
npm run start
```
