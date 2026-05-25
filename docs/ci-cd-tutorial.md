# TravleBuddy CI/CD Tutorial

This guide explains how the TravleBuddy CI/CD pipeline works, why secrets belong in GitHub Actions and Vercel instead of committed `.env` files, and how to configure the pipeline yourself.

---

# 1. What CI/CD Means

CI/CD has two parts:

- Continuous Integration: automatically checks code when you open a pull request or push to `main`.
- Continuous Deployment: automatically deploys approved code after it passes the required checks.

For TravleBuddy, CI currently verifies that the Next.js app, TypeScript code, ESLint setup, and Prisma schema are healthy before code is merged or deployed.

---

# 2. Why Secrets Should Not Live in `.env` in Git

Local `.env` files are useful for development, but they should stay on your machine.

Do not commit `.env` because it can contain:

- Database credentials
- Authentication secrets
- Gemini API keys
- Google Maps, Places, and Routes API keys
- Production URLs

If a secret is committed, it can be exposed through:

- GitHub history
- Forks or cloned copies
- Pull request diffs
- Error reports or logs
- Teammates or tools that do not need production access

Deleting the line later is not enough, because Git keeps old commits. Once a real key is committed, you should assume it is compromised and rotate it in the provider dashboard.

---

# 3. Why GitHub Actions and Vercel Need Separate Secrets

GitHub Actions and Vercel run in different environments.

GitHub Actions needs secrets for CI checks. For example, the CI workflow may need `DATABASE_URL` so Prisma can validate or generate against the expected setup.

Vercel needs secrets when it builds and runs the deployed app. For example, production Server Actions, API routes, auth, and database calls need runtime access to the real production credentials.

Putting secrets in both places is normal:

- GitHub Actions secrets are for repository automation.
- Vercel environment variables are for preview and production deployments.
- Local `.env` is only for your development machine.

---

# 4. Current Pipeline Files

The CI pipeline lives here:

```text
.github/workflows/ci.yml
```

The scripts it runs are defined here:

```text
package.json
```

Current scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "prisma:validate": "prisma validate",
  "prisma:generate": "prisma generate",
  "db:deploy": "prisma migrate deploy"
}
```

---

# 5. What the GitHub Actions Workflow Does

The workflow runs on:

- Pull requests targeting `main`
- Pushes to `main`

It performs these steps:

1. Checkout the repository.
2. Install Node.js 20.
3. Install dependencies with `npm ci`.
4. Validate the Prisma schema.
5. Generate the Prisma client.
6. Run ESLint.
7. Run TypeScript checks.
8. Build the Next.js production app.

These steps catch common issues before they reach production.

---

# 6. How to Add Secrets to GitHub Actions

In GitHub:

1. Open the TravleBuddy repository.
2. Go to `Settings`.
3. Go to `Secrets and variables`.
4. Choose `Actions`.
5. Click `New repository secret`.
6. Add each required key and value.

Recommended GitHub Actions secrets:

```text
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
GEMINI_API_KEY
GOOGLE_MAPS_API_KEY
GOOGLE_PLACES_API_KEY
GOOGLE_ROUTES_API_KEY
```

For CI, prefer staging or test credentials when possible. Avoid using production credentials in CI unless the workflow genuinely needs them.

---

# 7. How to Add Environment Variables to Vercel

In Vercel:

1. Open the TravleBuddy project.
2. Go to `Settings`.
3. Go to `Environment Variables`.
4. Add each key and value.
5. Choose which environments should receive each value:
   - Production
   - Preview
   - Development

Recommended Vercel variables:

```text
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
GEMINI_API_KEY
GOOGLE_MAPS_API_KEY
GOOGLE_PLACES_API_KEY
GOOGLE_ROUTES_API_KEY
```

Use different values for Preview and Production when possible. Preview deployments should not accidentally write to production data.

---

# 8. Local `.env` Usage

Use `.env` or `.env.local` only for local development.

Example local-only file:

```text
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="local-development-secret"
NEXTAUTH_URL="http://localhost:3000"
GEMINI_API_KEY="..."
GOOGLE_MAPS_API_KEY="..."
GOOGLE_PLACES_API_KEY="..."
GOOGLE_ROUTES_API_KEY="..."
```

This repository already ignores `.env*` in `.gitignore`, which helps prevent accidental commits.

You can verify ignored files with:

```bash
git status --ignored
```

---

# 9. Public vs Private Environment Variables

Next.js only exposes environment variables to the browser when they start with:

```text
NEXT_PUBLIC_
```

Use `NEXT_PUBLIC_` only for values that are safe for users to see.

Private server-only examples:

```text
DATABASE_URL
NEXTAUTH_SECRET
GEMINI_API_KEY
GOOGLE_PLACES_API_KEY
GOOGLE_ROUTES_API_KEY
```

Public examples:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
```

For Google Maps, it is common to use a browser-restricted public key for client-side map rendering and separate server-only keys for Places or Routes calls. Restrict public browser keys by domain in Google Cloud.

---

# 10. How Deployment Should Work

Recommended flow:

1. Create a feature branch.
2. Push your branch to GitHub.
3. Open a pull request into `main`.
4. GitHub Actions runs CI.
5. Vercel creates a Preview deployment.
6. Review and test the Preview deployment.
7. Merge into `main`.
8. Vercel deploys Production.

The main idea is simple: code should be checked before merge, previewed before release, and deployed automatically after approval.

---

# 11. Database Migrations

This project uses Prisma, so production database changes should eventually go through migrations.

Development command:

```bash
npx prisma migrate dev
```

Production deployment command:

```bash
npm run db:deploy
```

Do not use `prisma migrate dev` in production. It is designed for local development and migration creation.

Once real Prisma models and migrations exist, add a deployment step in Vercel or a protected GitHub Actions deployment workflow that runs:

```bash
npm run db:deploy
```

---

# 12. How to Test the Pipeline Locally

Run the same checks locally before pushing:

```bash
npm ci
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm run build
```

On Windows PowerShell, if `npm` is blocked by execution policy, use:

```bash
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

---

# 13. Current Known Build Note

The app currently imports Geist fonts from `next/font/google`.

During local sandboxed builds, `next build` can fail if the environment cannot reach Google Fonts. GitHub Actions and Vercel normally have network access, so this should usually pass there.

For fully deterministic builds, consider self-hosting fonts instead of fetching them during the build.

---

# 14. Next Improvements

The pipeline is ready for the current pre-MVP state. As the app grows, add:

- Unit tests for recommendation scoring
- Unit tests for conflict detection
- Unit tests for itinerary building
- Integration tests for trip creation and persistence
- End-to-end tests for auth, trip creation, maps, itinerary generation, and export
- A protected migration deployment workflow
- Branch protection requiring CI to pass before merge
