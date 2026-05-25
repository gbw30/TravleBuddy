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
  AUTH_URL: z.url(),
  AUTH_GOOGLE_ID: nonEmpty,
  AUTH_GOOGLE_SECRET: nonEmpty,
  GEMINI_API_KEY: nonEmpty.optional(),
  GOOGLE_MAPS_API_KEY: nonEmpty.optional(),
  GOOGLE_PLACES_API_KEY: nonEmpty.optional(),
  GOOGLE_ROUTES_API_KEY: nonEmpty.optional(),
});

const rawServerEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL ?? process.env.NEXTAUTH_URL,
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID,
  AUTH_GOOGLE_SECRET:
    process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
  GOOGLE_ROUTES_API_KEY: process.env.GOOGLE_ROUTES_API_KEY,
};

function formatEnvErrors(error: z.ZodError) {
  return error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

export function validateServerEnv() {
  const parsed = serverEnvSchema.safeParse(rawServerEnv);

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${formatEnvErrors(parsed.error)}`,
    );
  }

  return parsed.data;
}

export const env = validateServerEnv();

export type ServerEnv = z.infer<typeof serverEnvSchema>;
