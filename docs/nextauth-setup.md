# NextAuth Setup for TravleBuddy

TravleBuddy's requirements specify Auth.js / NextAuth with Google OAuth for the MVP.

Email and password auth is intentionally deferred because it requires password hashing, password reset, email verification, abuse protection, and extra security work.

---

# 1. Recommended Auth Choice

Use Google OAuth through Auth.js / NextAuth.

For this project:

- Provider: Google
- Database: Neon PostgreSQL
- ORM: Prisma
- App framework: Next.js App Router
- Deployment: Vercel
- Protected app area: dashboard, trips, profile, itinerary, export, recommendation actions

The project currently has `next-auth` v4 installed. The current Auth.js documentation uses `next-auth@beta` with the v5-style API.

Recommended path:

```bash
npm install next-auth@beta @auth/prisma-adapter @prisma/client
```

If you intentionally stay on `next-auth` v4, use `@next-auth/prisma-adapter` instead of `@auth/prisma-adapter`, and keep the `NEXTAUTH_*` environment variable names.

---

# 2. Required Environment Variables

For the recommended Auth.js setup, add these locally in `.env.local`:

```text
AUTH_SECRET="long-random-secret"
AUTH_URL="http://localhost:3000"
AUTH_GOOGLE_ID="google-client-id"
AUTH_GOOGLE_SECRET="google-client-secret"
```

Keep database variables from the Neon setup:

```text
DATABASE_URL="neon-pooled-url"
DIRECT_URL="neon-direct-url"
```

For Vercel production, use:

```text
AUTH_URL="https://your-production-domain.com"
```

If staying on NextAuth v4, use:

```text
NEXTAUTH_SECRET="long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="google-client-id"
GOOGLE_CLIENT_SECRET="google-client-secret"
```

Do not commit real values.

---

# 3. Generate the Auth Secret

Run:

```bash
npx auth secret
```

That creates a strong secret. If it writes directly to `.env.local`, keep that file uncommitted.

---

# 4. Configure Google OAuth

In Google Cloud Console:

1. Create or open a Google Cloud project.
2. Configure the OAuth consent screen.
3. Create an OAuth Client ID.
4. Choose `Web application`.
5. Add authorized JavaScript origins:

```text
http://localhost:3000
https://your-production-domain.com
```

6. Add authorized redirect URIs:

```text
http://localhost:3000/api/auth/callback/google
https://your-production-domain.com/api/auth/callback/google
```

7. Copy the client ID and client secret into `.env.local`, GitHub Actions secrets, and Vercel environment variables as appropriate.

---

# 5. Prisma Auth Models

The Prisma schema needs the Auth.js models so users, OAuth accounts, sessions, and verification tokens can persist in Neon.

Add these models to `prisma/schema.prisma` before creating migrations:

```prisma
model Account {
  id                String  @id @default(cuid())
  userId            String  @map("user_id")
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id")
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime? @map("email_verified")
  image         String?
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  accounts Account[]
  sessions Session[]
  trips    Trip[]

  @@map("users")
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}
```

When the `Trip` model is added, relate it to `User`:

```prisma
model Trip {
  id          String   @id @default(cuid())
  userId      String   @map("user_id")
  destination String
  startDate   DateTime @map("start_date")
  endDate     DateTime @map("end_date")
  budget      Decimal?
  status      String
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("trips")
}
```

Then run:

```bash
npx prisma migrate dev --name add_auth
npm run prisma:generate
```

---

# 6. Prisma Client

Create or update `src/lib/db.ts` so app code can use Prisma:

```ts
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

If Prisma requires a driver adapter for the generated client in this project, install and configure the Postgres adapter according to the Prisma setup being used.

---

# 7. Auth Config

Create or update `src/lib/auth.ts`:

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
});
```

---

# 8. Auth Route Handler

Create:

```text
src/app/api/auth/[...nextauth]/route.ts
```

Add:

```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

Next.js App Router route handlers export HTTP methods like `GET` and `POST`.

---

# 9. Protect Routes

Since this project uses Next.js 16, use `proxy.ts` instead of `middleware.ts`.

Create:

```text
src/proxy.ts
```

Add:

```ts
export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/trips/:path*",
    "/profile/:path*",
    "/api/recommendations/:path*",
    "/api/itinerary/:path*",
    "/api/export/:path*",
  ],
};
```

For finer authorization, still check ownership inside queries, Server Actions, and Route Handlers.

---

# 10. Enforce Trip Ownership

Any trip query should use the session user ID.

Example:

```ts
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function getTrip(tripId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return db.trip.findFirst({
    where: {
      id: tripId,
      userId: session.user.id,
    },
  });
}
```

That matches the project requirement: users may only access trips where `trip.userId === session.user.id`.

---

# 11. Type the Session User ID

Create:

```text
src/types/next-auth.d.ts
```

Add:

```ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
```

---

# 12. Test Locally

Run:

```bash
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run dev
```

The app validates auth environment variables at server startup through Zod. If `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, or `AUTH_GOOGLE_SECRET` is missing, startup should fail with the variable name and validation message.

Open:

```text
http://localhost:3000/api/auth/signin
```

You should see the Google sign-in option.

---

# 13. Deployment Checklist

Add the same auth variables to Vercel:

```text
AUTH_SECRET
AUTH_URL
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
DATABASE_URL
DIRECT_URL
```

Add production Google OAuth redirect URI:

```text
https://your-production-domain.com/api/auth/callback/google
```

Before deploying production database changes:

```bash
npm run db:deploy
```
