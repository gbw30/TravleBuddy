import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { failureExcerptMaxBytes } from "../agent-system/registry";
import { commandResultSchema, redactString } from "../contracts";
import { qaResultsDirectory } from "../runtime/fixtures";
import { readQaEnvironment } from "../runtime/environment";

type CommandDefinition = {
  name: string;
  executable: string;
  args: string[];
  requiresSafety?: boolean;
  requiresBuild?: boolean;
};

function failureExcerpt(value: string) {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length <= failureExcerptMaxBytes) return value;
  return `[last ${failureExcerptMaxBytes} bytes]\n${buffer
    .subarray(buffer.length - failureExcerptMaxBytes)
    .toString("utf8")}`;
}

async function main() {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error("Run the deterministic gate through npm run qa:gate.");
  }
  const npm = process.execPath;
  const npmArgs = (args: string[]) => [npmExecPath, ...args];
  const environment = readQaEnvironment();
  const reportDirectory = path.join(
    qaResultsDirectory(environment.runId),
    "deterministic",
  );
  await mkdir(reportDirectory, { recursive: true });

  const secretValues = Object.entries(process.env)
    .filter(([key, value]) =>
      Boolean(
        value &&
          /(?:SECRET|TOKEN|PASSWORD|COOKIE|API_KEY|DATABASE_URL|DIRECT_URL)/i.test(
            key,
          ),
      ),
    )
    .map(([, value]) => value as string);

  const commandLabel = (command: CommandDefinition) =>
    command.executable === npm && command.args[0] === npmExecPath
      ? ["npm", ...command.args.slice(1)].join(" ")
      : [command.executable, ...command.args].join(" ");
  const trackedState = () => {
    const result = spawnSync(
      "git",
      ["status", "--porcelain", "--untracked-files=no"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    return result.status === 0 ? result.stdout : null;
  };

  const initialTrackedState = trackedState();
  let safetyReady = false;
  let buildReady = false;
  const commands: CommandDefinition[] = [
    {
      name: "QA environment doctor",
      executable: npm,
      args: npmArgs(["run", "--silent", "qa:doctor"]),
    },
    {
      name: "QA manifest validation",
      executable: npm,
      args: npmArgs(["run", "--silent", "qa:validate"]),
    },
    { name: "ESLint", executable: npm, args: npmArgs(["run", "lint"]) },
    {
      name: "TypeScript",
      executable: npm,
      args: npmArgs(["run", "typecheck"]),
    },
    { name: "Vitest", executable: npm, args: npmArgs(["test"]) },
    {
      name: "Vitest V8 coverage",
      executable: npm,
      args: npmArgs(["run", "qa:coverage"]),
    },
    {
      name: "Prisma schema validation",
      executable: npm,
      args: npmArgs(["run", "prisma:validate"]),
    },
    {
      name: "Production build",
      executable: npm,
      args: npmArgs(["run", "build"]),
    },
    {
      name: "Migration status",
      executable: npm,
      args: npmArgs(["run", "prisma:status"]),
      requiresSafety: true,
    },
    {
      name: "Chromium P0 E2E",
      executable: npm,
      args: npmArgs(["run", "qa:e2e:critical"]),
      requiresSafety: true,
      requiresBuild: true,
    },
  ];
  const results: Array<ReturnType<typeof commandResultSchema.parse>> = [];

  for (const command of commands) {
    const evidencePath = path.join(
      reportDirectory,
      `${String(results.length + 1).padStart(2, "0")}-${command.name
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}.log`,
    );
    const blockedReason =
      command.requiresSafety && !safetyReady
        ? "Skipped because the environment safety doctor did not pass."
        : command.requiresBuild && !buildReady
          ? "Skipped because the production build did not pass."
          : null;

    if (blockedReason) {
      await writeFile(evidencePath, `${blockedReason}\n`, "utf8");
      results.push(
        commandResultSchema.parse({
          name: command.name,
          command: commandLabel(command),
          status: "blocked",
          exitCode: null,
          durationMs: 0,
          evidencePaths: [path.relative(process.cwd(), evidencePath)],
        }),
      );
      process.stdout.write(`[BLOCKED] ${command.name}: ${blockedReason}\n`);
      continue;
    }

    const startedAt = Date.now();
    const result = spawnSync(command.executable, command.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(command.name === "Chromium P0 E2E"
          ? { QA_WEB_SERVER_MODE: process.env.QA_WEB_SERVER_MODE ?? "start" }
          : {}),
      },
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    const durationMs = Date.now() - startedAt;
    const combinedOutput = redactString(
      `${result.stdout ?? ""}${result.stderr ?? ""}${
        result.error ? `\n${result.error.message}` : ""
      }`,
      secretValues,
    );
    await writeFile(evidencePath, combinedOutput, "utf8");

    const passed = result.status === 0;
    if (command.name === "QA environment doctor") safetyReady = passed;
    if (command.name === "Production build") buildReady = passed;
    results.push(
      commandResultSchema.parse({
        name: command.name,
        command: commandLabel(command),
        status: passed
          ? "passed"
          : command.name === "QA environment doctor"
            ? "blocked"
            : "failed",
        exitCode: result.status,
        durationMs,
        evidencePaths: [path.relative(process.cwd(), evidencePath)],
      }),
    );

    process.stdout.write(
      `[${passed ? "PASS" : command.name === "QA environment doctor" ? "BLOCKED" : "FAIL"}] ${command.name} (${durationMs} ms)\n`,
    );
    if (!passed && combinedOutput) {
      process.stdout.write(`${failureExcerpt(combinedOutput)}\n`);
    }
  }

  const finalTrackedState = trackedState();
  const trackedStateChanged =
    initialTrackedState !== null && finalTrackedState !== initialTrackedState;
  if (trackedStateChanged) {
    results.push(
      commandResultSchema.parse({
        name: "Tracked-state preservation",
        command: "git status --porcelain --untracked-files=no",
        status: "failed",
        exitCode: 1,
        durationMs: 0,
        evidencePaths: [],
      }),
    );
  }

  const status = results.some((result) => result.status === "failed")
    ? "FAIL"
    : results.some((result) => result.status === "blocked")
      ? "BLOCKED"
      : "PASS";
  const report = {
    reportVersion: 1,
    runId: environment.runId,
    target: environment.target,
    generatedAt: new Date().toISOString(),
    status,
    trackedStateChanged,
    commands: results,
  };
  await writeFile(
    path.join(reportDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(
    `TravleBuddy deterministic gate: ${status} (${results.filter((result) => result.status === "passed").length}/${results.length} checks passed)\n`,
  );
  process.exitCode = status === "PASS" ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
