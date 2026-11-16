import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  parseMigrationPhase,
  sanitizeMigrationError,
  writeMigrationFailureReceipt,
} from "./migration-evidence";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("migration failure evidence", () => {
  test("recognizes only supported migration phases", () => {
    expect(parseMigrationPhase("preflight")).toBe("preflight");
    expect(parseMigrationPhase("postflight")).toBe("postflight");
    expect(parseMigrationPhase("deploy")).toBeNull();
  });

  test("redacts database credentials and explicit environment secrets", () => {
    const databaseUrl =
      "postgresql://qa-user:private-password@qa.example.test/travlebuddy";
    const providerSecret = "private-provider-secret";
    const message = sanitizeMigrationError(
      new Error(`Failed for ${databaseUrl} with ${providerSecret}`),
      {
        DATABASE_URL: databaseUrl,
        OLD_LEAF_API_KEY: providerSecret,
      },
    );

    expect(message).not.toContain("private-password");
    expect(message).not.toContain(providerSecret);
    expect(message).toContain("[REDACTED]");
  });

  test("writes a sanitized receipt when preflight fails", async () => {
    const receiptDirectory = await mkdtemp(
      path.join(os.tmpdir(), "travlebuddy-migration-evidence-"),
    );
    temporaryDirectories.push(receiptDirectory);
    const secret = "private-database-secret";
    const result = await writeMigrationFailureReceipt({
      phase: "preflight",
      error: new Error(`Invalid environment: ${secret}`),
      source: {
        QA_RUN_ID: "qa-migration-test",
        DATABASE_URL: secret,
      },
      receiptDirectory,
      generatedAt: "2026-07-25T00:00:00.000Z",
    });
    const raw = await readFile(result.receiptPath, "utf8");
    const receipt = JSON.parse(raw) as Record<string, unknown>;

    expect(raw).not.toContain(secret);
    expect(receipt).toMatchObject({
      receiptVersion: 1,
      status: "failed",
      phase: "preflight",
      generatedAt: "2026-07-25T00:00:00.000Z",
      runId: "qa-migration-test",
      error: "Invalid environment: [REDACTED]",
      redactionConfirmed: true,
    });
  });
});
