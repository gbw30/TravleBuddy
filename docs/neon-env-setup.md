# Neon Environment Setup

This project should use separate Neon databases for local development, preview, and production.

The recommended setup is:

- Local development: your local `.env.local` or `.env`
- CI: GitHub Actions repository secrets
- Preview and production deployments: Vercel environment variables

Do not commit real connection strings.

---

# 1. Create Neon Databases or Branches

In Neon, create one project for TravleBuddy.

Recommended branches:

- `main`: production data
- `dev`: local development and safe testing
- Preview branches: optionally created automatically through the Neon + Vercel integration

You can also use separate Neon projects for dev and prod if you want stronger isolation. Branches are simpler while the project is pre-MVP.

---

# 2. Get Both Connection Strings

For each Neon branch you use, copy two connection strings:

- Pooled connection string
- Direct connection string

Use them like this:

```text
DATABASE_URL=pooled Neon connection string
DIRECT_URL=direct Neon connection string
```

Why two URLs?

- `DATABASE_URL` should be pooled because the deployed Next.js app runs in a serverless environment and may open many short-lived connections.
- `DIRECT_URL` should be direct because Prisma CLI commands and migrations should connect directly to the database.

The pooled Neon host usually contains `-pooler`.

---

# 3. Local Development

Create `.env.local` or `.env` in the project root.

Use your dev Neon branch, not production:

```text
DATABASE_URL="postgresql://USER:PASSWORD@DEV_HOST-pooler.REGION.aws.neon.tech/DB_NAME?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@DEV_HOST.REGION.aws.neon.tech/DB_NAME?sslmode=require"

NEXTAUTH_SECRET="local-development-secret"
NEXTAUTH_URL="http://localhost:3000"

GEMINI_API_KEY="local-or-dev-key"
GOOGLE_MAPS_API_KEY="local-or-dev-key"
GOOGLE_PLACES_API_KEY="local-or-dev-key"
GOOGLE_ROUTES_API_KEY="local-or-dev-key"
```

This repository includes `.env.example` as a safe template.

---

# 4. GitHub Actions Secrets

GitHub Actions uses secrets for CI.

In GitHub:

1. Open the repository.
2. Go to `Settings`.
3. Go to `Secrets and variables`.
4. Open `Actions`.
5. Add repository secrets.

Add:

```text
DATABASE_URL
DIRECT_URL
NEXTAUTH_SECRET
GEMINI_API_KEY
GOOGLE_MAPS_API_KEY
GOOGLE_PLACES_API_KEY
GOOGLE_ROUTES_API_KEY
```

For CI, prefer dev or staging Neon credentials. Avoid production credentials unless the workflow is specifically a protected production deployment workflow.

---

# 5. Vercel Environment Variables

In Vercel:

1. Open the TravleBuddy project.
2. Go to `Settings`.
3. Go to `Environment Variables`.
4. Add the variables for each environment.

Production should use the production Neon branch:

```text
DATABASE_URL=production pooled URL
DIRECT_URL=production direct URL
NEXTAUTH_URL=https://your-production-domain.com
```

Preview should use a preview or dev Neon branch:

```text
DATABASE_URL=preview/dev pooled URL
DIRECT_URL=preview/dev direct URL
NEXTAUTH_URL=https://your-preview-url-or-vercel-generated-url
```

Development can use the dev Neon branch if you use `vercel dev` or `vercel env pull`.

---

# 6. Vercel + Neon Integration Option

Neon offers Vercel integrations that can inject database environment variables into Vercel and support preview branching.

Use this if you want Vercel preview deployments to get isolated Neon database branches automatically.

Manual setup is also fine:

- Add `DATABASE_URL` and `DIRECT_URL` yourself in Vercel.
- Use one shared dev database for previews until you need stronger isolation.

---

# 7. Prisma Commands

Validate the schema:

```bash
npm run prisma:validate
```

Generate the Prisma client:

```bash
npm run prisma:generate
```

Create development migrations:

```bash
npx prisma migrate dev
```

Apply existing migrations in production:

```bash
npm run db:deploy
```

Use `migrate dev` locally. Use `migrate deploy` in production.

---

# 8. Quick Mental Model

Use this rule:

```text
Local app -> local .env.local -> Neon dev branch
GitHub CI -> GitHub secrets -> Neon dev/staging branch
Vercel preview -> Vercel Preview env vars -> Neon preview/dev branch
Vercel production -> Vercel Production env vars -> Neon production branch
```

That keeps production data away from experiments while still letting CI and previews behave like the real app.

---

# 9. Startup Validation

The project validates server environment variables with Zod in:

```text
src/lib/env.ts
```

Next.js loads the validation at server startup through:

```text
src/instrumentation.ts
```

If a required variable is missing or malformed, the app throws an error before handling requests. The error reports variable names and validation messages, not secret values.

Required startup variables:

```text
DATABASE_URL
AUTH_SECRET or NEXTAUTH_SECRET
AUTH_URL or NEXTAUTH_URL
AUTH_GOOGLE_ID or GOOGLE_CLIENT_ID
AUTH_GOOGLE_SECRET or GOOGLE_CLIENT_SECRET
```

Optional variables currently validated when present:

```text
DIRECT_URL
GEMINI_API_KEY
GOOGLE_MAPS_API_KEY
GOOGLE_PLACES_API_KEY
GOOGLE_ROUTES_API_KEY
```
