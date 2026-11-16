import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactString } from "../contracts";

export type MigrationPhase = "preflight" | "postflight";

const safeRunId = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;

export function parseMigrationPhase(value: string | undefined) {
  return value === "preflight" || value === "postflight" ? value : null;
}

function explicitSecretValues(source: Record<string, string | undefined>) {
  return Object.entries(source)
    .filter(([key, value]) =>
      Boolean(
        value &&
        /(?:SECRET|TOKEN|PASSWORD|COOKIE|API_KEY|DATABASE_URL|DIRECT_URL)/i.test(
          key,
        ),
      ),
    )
    .map(([, value]) => value as string);
}

export function sanitizeMigrationError(
  error: unknown,
  source: Record<string, string | undefined> = process.env,
) {
  return redactString(
    error instanceof Error ? error.message : String(error),
    explicitSecretValues(source),
  );
}

export async function writeMigrationFailureReceipt(options: {
  phase: MigrationPhase | null;
  error: unknown;
  source?: Record<string, string | undefined>;
  receiptDirectory?: string;
  generatedAt?: string;
}) {
  const source = options.source ?? process.env;
  const rawRunId = source.QA_RUN_ID?.trim();
  const runId = rawRunId && safeRunId.test(rawRunId) ? rawRunId : null;
  const error = sanitizeMigrationError(options.error, source);
  const receiptDirectory =
    options.receiptDirectory ?? path.resolve("qa-results", "qa-migration");
  const phase = options.phase ?? "unknown";
  const receipt = {
    receiptVersion: 1,
    status: "failed",
    phase,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    runId,
    error,
    redactionConfirmed: true,
  };

  await mkdir(receiptDirectory, { recursive: true });
  const receiptPath = path.join(
    receiptDirectory,
    `${phase}-failure-receipt.json`,
  );
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  return { receiptPath, error };
}
