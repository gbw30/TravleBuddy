import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const postgresUrl = nonEmpty.startsWith("postgresql://", {
  message: "Must be a PostgreSQL connection string.",
});

const serverEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl.optional(),
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

export const env = validateServerEnv();

export type ServerEnv = z.infer<typeof serverEnvSchema>;
