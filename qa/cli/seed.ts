import { readQaEnvironment } from "../runtime/environment";
import { resetPreviewBaseline, seedQaFixtures } from "../runtime/fixtures";

async function main() {
  const environment = readQaEnvironment();
  const baseline = process.argv.includes("--baseline");
  const result = baseline
    ? await resetPreviewBaseline(environment)
    : await seedQaFixtures(environment);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
