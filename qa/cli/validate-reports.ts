import { validateAndSummarizeWorkerReports } from "../agent-system/reports";
import { readQaEnvironment } from "../runtime/environment";

async function main() {
  const environment = readQaEnvironment();
  const summary = await validateAndSummarizeWorkerReports(environment.runId);
  process.stdout.write(
    `${JSON.stringify(
      {
        status:
          summary.missingReports.length === 0 &&
          summary.invalidReports.length === 0
            ? "valid"
            : "incomplete",
        workers: summary.workers.length,
        missingReports: summary.missingReports,
        invalidReports: summary.invalidReports,
        evidenceIndexPath: summary.evidenceIndexPath,
      },
      null,
      2,
    )}\n`,
  );

  if (summary.missingReports.length > 0 || summary.invalidReports.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
