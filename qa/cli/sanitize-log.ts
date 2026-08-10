import { readFile, writeFile } from "node:fs/promises";
import { redactString } from "../contracts";

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    throw new Error("Usage: tsx qa/cli/sanitize-log.ts <input> <output>");
  }
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
  const raw = await readFile(inputPath, "utf8");
  await writeFile(outputPath, redactString(raw, secretValues), "utf8");
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
