import { describe, expect, test } from "vitest";
import {
  assertProductionReadOnly,
  assertQaWritesAllowed,
  assertReadOnlyHttpMethod,
  canonicalDatabaseIdentity,
  fingerprintDatabaseUrl,
  readQaEnvironment,
} from "./environment";

const databaseUrl =
  "postgresql://qa-user:super-secret@QA.EXAMPLE.test:5433/travlebuddy_qa?sslmode=require";

function writableEnvironment(overrides: Record<string, string> = {}) {
  return readQaEnvironment({
    QA_TARGET: "preview",
    QA_BASE_URL: "https://travlebuddy-qa.example.test",
    QA_RUN_ID: "run-20260721",
    QA_ALLOW_WRITES: "true",
    QA_DATABASE_FINGERPRINT: fingerprintDatabaseUrl(databaseUrl),
    DATABASE_URL: databaseUrl,
    ...overrides,
  });
}

describe("QA environment guard", () => {
  test("fingerprints only the credential-free database identity", () => {
    expect(canonicalDatabaseIdentity(databaseUrl)).toBe(
      "postgresql://qa.example.test:5433/travlebuddy_qa",
    );
    expect(fingerprintDatabaseUrl(databaseUrl)).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintDatabaseUrl(databaseUrl)).toBe(
      fingerprintDatabaseUrl(
        "postgresql://different:credentials@qa.example.test:5433/travlebuddy_qa?other=value",
      ),
    );
  });

  test("accepts an explicitly authorized preview database", () => {
    expect(assertQaWritesAllowed(writableEnvironment())).toMatchObject({
      target: "preview",
      runId: "run-20260721",
    });
  });

  test("rejects missing authorization and fingerprint mismatches", () => {
    expect(() =>
      assertQaWritesAllowed(
        writableEnvironment({ QA_ALLOW_WRITES: "false" }),
      ),
    ).toThrow("QA_ALLOW_WRITES=true");
    expect(() =>
      assertQaWritesAllowed(
        writableEnvironment({ QA_DATABASE_FINGERPRINT: "0".repeat(64) }),
      ),
    ).toThrow("fingerprint does not match");
  });

  test("always rejects writes to production", () => {
    expect(() =>
      assertQaWritesAllowed(
        writableEnvironment({
          QA_TARGET: "production-readonly",
          QA_ALLOW_WRITES: "true",
        }),
      ),
    ).toThrow("forbidden");
  });

  test("requires an explicitly read-only production target", () => {
    const environment = writableEnvironment({
      QA_TARGET: "production-readonly",
      QA_ALLOW_WRITES: "false",
    });

    expect(() => assertProductionReadOnly(environment)).not.toThrow();
  });

  test.each(["POST", "put", " Patch ", "DELETE"])(
    "rejects the %s HTTP method in production smoke mode",
    (method) => {
      expect(() => assertReadOnlyHttpMethod(method)).toThrow(
        `forbidden ${method.trim().toUpperCase()}`,
      );
    },
  );

  test.each(["GET", "HEAD", "OPTIONS"])(
    "allows the %s HTTP method in production smoke mode",
    (method) => {
      expect(assertReadOnlyHttpMethod(method)).toBe(method);
    },
  );
});
