# Neon Environment Setup

Status: operational
Authority: Database connection roles and secret-safe use of the existing Neon topology
Related: [Operating constraints](operating-constraints.md), [developer finish guide](developer-finish-guide.md), [knowledge map](README.md)
Last reviewed: 2026-08-09

TravleBuddy already has an authorized QA database and a production database. Reuse them. Do not create a Neon project, branch, clone, disposable cloud database, or automatic preview database unless the developer explicitly approves that specific topology change.

## Connection roles

| Use                                                   | Role                                      | Connection type | Variable                             |
| ----------------------------------------------------- | ----------------------------------------- | --------------- | ------------------------------------ |
| Vercel QA runtime                                     | `qa_app`                                  | Pooled          | `DATABASE_URL`                       |
| Local adaptive worker against QA                      | `qa_app`                                  | Pooled          | session-only `DATABASE_URL`          |
| Protected QA migrations                               | `qa_migrator`                             | Direct          | GitHub environment `QA_DIRECT_URL`   |
| Protected QA verification where Prisma expects pooled | `qa_migrator` or workflow-defined QA role | Pooled          | GitHub environment `QA_DATABASE_URL` |
| Production Vercel runtime                             | production application role               | Pooled          | production `DATABASE_URL`            |
| Protected production migration                        | authorized migration owner                | Direct          | protected workflow only              |

The pooled host commonly contains `-pooler`. Prisma migration commands need a direct connection; serverless application traffic should use the pooled connection. Do not grant migration ownership to the runtime application role merely to simplify setup.

## Existing environments

- **Local development:** local `.env`/`.env.local` may point to the developer's currently authorized target. Confirm the target before any write or migration; current local values may be production-oriented.
- **QA Vercel target:** use only the existing QA pooled URL and QA-scoped Auth/provider values.
- **GitHub `qa-migrations` environment:** stores `QA_DATABASE_URL`, `QA_DIRECT_URL`, the credential-free QA fingerprint, and required authorization metadata.
- **Production:** production credentials remain production-scoped and never enter QA configuration.

Never paste connection strings into documentation, chat, screenshots, commits, logs, or evidence. A database fingerprint is a one-way credential-free identity value; it is safe to compare but cannot be used to connect.

## Local session use

Do not overwrite a production-oriented `.env` for a QA demonstration. Supply the QA pooled application URL only to the current PowerShell session:

```powershell
$env:DATABASE_URL = Read-Host "Existing QA pooled qa_app URL"
$env:NODE_ENV = "production"
$env:PLACE_PROVIDER_MODE = "mock"
$env:QA_PROVIDER_MODE = "mock"
npm run worker:start
```

After stopping the worker, remove the session values:

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
Remove-Item Env:PLACE_PROVIDER_MODE -ErrorAction SilentlyContinue
Remove-Item Env:QA_PROVIDER_MODE -ErrorAction SilentlyContinue
```

## Protected migrations

1. Freeze the exact `qa` commit.
2. Confirm the credential-free QA fingerprint differs from production and matches the protected environment value.
3. Confirm the expected migration head and zero failed migrations.
4. Obtain explicit authorization for that full commit SHA.
5. Dispatch `.github/workflows/qa-migrations.yml`.
6. Inspect preflight, deploy/no-op, postflight, and empty-diff evidence.

The protected QA migration workflow has already certified commit `e6e74c65fe3c2d5377eeeee1a67c90675d21ad60`. A documentation-only commit does not add a migration.

Use `npm run prisma:validate` and `npm run prisma:generate` freely; they do not deploy schema changes. Do not run `prisma migrate dev`, `prisma migrate deploy`, or `npm run db:deploy` until the exact database and authorization are confirmed.
