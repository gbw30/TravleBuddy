import { readQaEnvironment } from "../runtime/environment";
import {
  cleanupExpiredQaFixtures,
  cleanupQaFixtures,
  readQaFixtureManifest,
} from "../runtime/fixtures";

async function main() {
  const environment = readQaEnvironment();

  if (process.argv.includes("--expired")) {
    const deleted = await cleanupExpiredQaFixtures(environment);
    process.stdout.write(`${JSON.stringify({ status: "cleaned", deleted })}\n`);
  } else {
    const manifest = await readQaFixtureManifest(environment.runId);
    await cleanupQaFixtures(environment, manifest);
    process.stdout.write(
      `${JSON.stringify({ status: "cleaned", runId: manifest.runId })}\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
