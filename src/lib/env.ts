import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const postgresUrl = nonEmpty.startsWith("postgresql://", {
  message: "Must be a PostgreSQL connection string.",
});

const databaseEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl.optional(),
});

const serverEnvSchema = databaseEnvSchema.extend({
  AUTH_SECRET: nonEmpty.min(32, {
    message: "Must be at least 32 characters.",
  }),
  AUTH_URL: z.url().optional(),
  AUTH_REDIRECT_PROXY_URL: z.url().optional(),
  AUTH_GOOGLE_ID: nonEmpty,
  AUTH_GOOGLE_SECRET: nonEmpty,
  GEMINI_API_KEY: nonEmpty.optional(),
  GOOGLE_MAPS_API_KEY: nonEmpty.optional(),
  GOOGLE_PLACES_API_KEY: nonEmpty.optional(),
  GOOGLE_ROUTES_API_KEY: nonEmpty.optional(),
});

type RawServerEnv = Record<string, string | undefined>;

function normalizeServerEnv(source: RawServerEnv) {
  return {
    DATABASE_URL: source.DATABASE_URL,
    DIRECT_URL: source.DIRECT_URL,
    AUTH_SECRET: source.AUTH_SECRET ?? source.NEXTAUTH_SECRET,
    AUTH_URL: source.AUTH_URL ?? source.NEXTAUTH_URL,
    AUTH_REDIRECT_PROXY_URL: source.AUTH_REDIRECT_PROXY_URL,
    AUTH_GOOGLE_ID: source.AUTH_GOOGLE_ID ?? source.GOOGLE_CLIENT_ID,
    AUTH_GOOGLE_SECRET:
      source.AUTH_GOOGLE_SECRET ?? source.GOOGLE_CLIENT_SECRET,
    GEMINI_API_KEY: source.GEMINI_API_KEY,
    GOOGLE_MAPS_API_KEY: source.GOOGLE_MAPS_API_KEY,
    GOOGLE_PLACES_API_KEY: source.GOOGLE_PLACES_API_KEY,
    GOOGLE_ROUTES_API_KEY: source.GOOGLE_ROUTES_API_KEY,
  };
}

function normalizeDatabaseEnv(source: RawServerEnv) {
  return {
    DATABASE_URL: source.DATABASE_URL,
    DIRECT_URL: source.DIRECT_URL,
  };
}

function formatEnvErrors(error: z.ZodError) {
  return error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

export function validateServerEnv(source: RawServerEnv = process.env) {
  const parsed = serverEnvSchema.safeParse(normalizeServerEnv(source));

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${formatEnvErrors(parsed.error)}`,
    );
  }

  return parsed.data;
}

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

export function getServerEnv(source: RawServerEnv = process.env) {
  return validateServerEnv(source);
}

export function validateDatabaseEnv(source: RawServerEnv = process.env) {
  const parsed = databaseEnvSchema.safeParse(normalizeDatabaseEnv(source));

  if (!parsed.success) {
    throw new Error(
      `Invalid database environment variables:\n${formatEnvErrors(parsed.error)}`,
    );
  }

  return parsed.data;
}

export function getDatabaseEnv(source: RawServerEnv = process.env) {
  return validateDatabaseEnv(source);
}

/**
 * The Google-free development sign-in. It needs both conditions, so a stray
 * flag on a deployed build (where NODE_ENV is "production") can never enable it.
 * It is also off on Vercel, where NODE_ENV could be mis-set by hand.
 */
export function isDevLoginEnabled(source: RawServerEnv = process.env) {
  return (
    source.NODE_ENV === "development" &&
    source.AUTH_DEV_LOGIN === "1" &&
    !source.VERCEL
  );
}

export const env = new Proxy({} as ServerEnv, {
  get(_target, property: keyof ServerEnv) {
    return getServerEnv()[property];
  },
});
