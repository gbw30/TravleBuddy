import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const qaTargetSchema = z.enum(["local", "preview", "production-readonly"]);

const qaEnvironmentSchema = z.object({
  QA_TARGET: qaTargetSchema,
  QA_BASE_URL: z.url(),
  QA_RUN_ID: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/),
  QA_ALLOW_WRITES: z.enum(["true", "false"]).default("false"),
  QA_DATABASE_FINGERPRINT: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
});

export type QaTarget = z.infer<typeof qaTargetSchema>;
export type QaEnvironment = {
  target: QaTarget;
  baseUrl: URL;
  runId: string;
  allowWrites: boolean;
  databaseUrl: string | null;
  expectedDatabaseFingerprint: string | null;
};

function defaultPort(protocol: string) {
  return protocol === "postgresql:" || protocol === "postgres:" ? "5432" : "";
}

export function canonicalDatabaseIdentity(value: string) {
  const url = new URL(value);

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("QA database URL must use PostgreSQL.");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

  if (!url.hostname || !database) {
    throw new Error("QA database URL must include a host and database name.");
  }

  const port = url.port || defaultPort(url.protocol);

  return `${url.protocol}//${url.hostname.toLocaleLowerCase()}:${port}/${database}`;
}

export function fingerprintDatabaseUrl(value: string) {
  return createHash("sha256")
    .update(canonicalDatabaseIdentity(value), "utf8")
    .digest("hex");
}

export function readQaEnvironment(
  source: Record<string, string | undefined> = process.env,
): QaEnvironment {
  const parsed = qaEnvironmentSchema.safeParse(source);

  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid QA environment: ${messages}`);
  }

  return {
    target: parsed.data.QA_TARGET,
    baseUrl: new URL(parsed.data.QA_BASE_URL),
    runId: parsed.data.QA_RUN_ID,
    allowWrites: parsed.data.QA_ALLOW_WRITES === "true",
    databaseUrl: parsed.data.DIRECT_URL ?? parsed.data.DATABASE_URL ?? null,
    expectedDatabaseFingerprint:
      parsed.data.QA_DATABASE_FINGERPRINT ?? null,
  };
}

function fingerprintsMatch(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");

  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function assertQaWritesAllowed(environment: QaEnvironment) {
  if (environment.target === "production-readonly") {
    throw new Error("QA writes are forbidden for production-readonly targets.");
  }

  if (!environment.allowWrites) {
    throw new Error("QA writes require QA_ALLOW_WRITES=true.");
  }

  if (!environment.databaseUrl) {
    throw new Error("QA writes require DIRECT_URL or DATABASE_URL.");
  }

  if (!environment.expectedDatabaseFingerprint) {
    throw new Error("QA writes require QA_DATABASE_FINGERPRINT.");
  }

  const actual = fingerprintDatabaseUrl(environment.databaseUrl);

  if (!fingerprintsMatch(actual, environment.expectedDatabaseFingerprint)) {
    throw new Error("QA database fingerprint does not match the configured target.");
  }

  if (
    environment.target === "local" &&
    !["localhost", "127.0.0.1", "::1"].includes(environment.baseUrl.hostname)
  ) {
    throw new Error("A local QA target must use a loopback QA_BASE_URL.");
  }

  return {
    databaseFingerprint: actual,
    target: environment.target,
    runId: environment.runId,
  };
}

export function assertProductionReadOnly(environment: QaEnvironment) {
  if (environment.target !== "production-readonly") {
    throw new Error("Production smoke checks require QA_TARGET=production-readonly.");
  }

  if (environment.allowWrites) {
    throw new Error("Production smoke checks require QA_ALLOW_WRITES=false.");
  }
}

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function assertReadOnlyHttpMethod(method: string) {
  const normalizedMethod = method.trim().toUpperCase();

  if (mutationMethods.has(normalizedMethod)) {
    throw new Error(
      `Production smoke attempted forbidden ${normalizedMethod} request.`,
    );
  }

  return normalizedMethod;
}
