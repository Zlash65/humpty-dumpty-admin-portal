This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Environment variables

This app reads server-side configuration from environment variables.

- **Next.js runtime** loads `.env.local` and `.env` automatically.
- **Node scripts** (migration/index/verification) also read `.env.local` and `.env`.

At minimum you should set:

- `DATABASE_URL` (Postgres connection string)
- `AUTH_SECRET` (required for signed auth cookies)
- `ADMIN_USERNAME` and `ADMIN_PASSWORD` (used to auto-seed the admin user)

### Database setup + migration (SQLite → Postgres)

If you're migrating from the Electron app's SQLite database (`school.db`), run:

```bash
# 1) Create tables/indexes in Postgres (safe to run multiple times)
npm run db:setup

# 2) Migrate SQLite data into Postgres
npm run migrate:sqlite -- /path/to/school.db

# 3) Verify counts + integrity
npm run verify:migration -- /path/to/school.db
```

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
