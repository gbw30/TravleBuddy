import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { costUsd, type TokenUsage } from "@/features/conversation/model/budget";
import { modelCall, type ModelCall } from "@/features/conversation/model/mode";
import {
  MODEL,
  readTypedInput,
} from "@/features/conversation/model/read-typed";
import type { Intent } from "@/features/conversation/contracts";

import { CASES, type Case, type Category } from "./cases";

// Measures how well the AI model reads typed messages into intents, through
// the same function production calls (readTypedInput). Each case in cases.ts
// is read once and graded field by field against the expected intent.
//
//   npx tsx scripts/model-eval/run.ts --dry-run          (no network)
//   ANTHROPIC_API_KEY=... npx tsx scripts/model-eval/run.ts [--model <id>]
//
// The dry run answers every case with its expected intent, to prove the
// grading and report work. A real run refuses to start when its estimate is
// over $0.50. It writes docs/quality/model-eval.md (not in a dry run).

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const at = args.indexOf("--model");
const model = at >= 0 ? args[at + 1] : MODEL;
const out = "docs/quality/model-eval.md";
const LIMIT_USD = 0.5;
// The system prompt and one message come to about 1,200 tokens; a reply to 80.
const ESTIMATE: TokenUsage = { inputTokens: 1_200, outputTokens: 80 };

/** The fields of `got` that differ from `expected`, by name. */
function mismatches(c: Case, got: Intent): string[] {
  const want = c.expected as Record<string, unknown>;
  const have = got as Record<string, unknown>;
  const norm = (v: unknown) =>
    JSON.stringify(
      Array.isArray(v)
        ? v.map((x) => (typeof x === "string" ? x.toLowerCase() : x)).sort()
        : typeof v === "string"
          ? v.toLowerCase()
          : v,
    );
  const bad: string[] = [];
  for (const key of new Set([...Object.keys(want), ...Object.keys(have)])) {
    if (c.loose?.includes(key)) {
      // shortcut: loose means present-or-absent is not checked, only that a
      // wanted loose field is not missing; upgrade if text quality matters.
      if (key in want && !(key in have)) bad.push(key);
    } else if (norm(want[key]) !== norm(have[key])) bad.push(key);
  }
  return bad;
}

/** A stand-in that answers with the expected intent of the case it is given. */
function standIn(c: Case): ModelCall {
  return async () =>
    ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ intent: c.expected }) }],
      usage: {
        input_tokens: ESTIMATE.inputTokens,
        output_tokens: ESTIMATE.outputTokens,
      },
    }) as Awaited<ReturnType<ModelCall>>;
}

async function main() {
  const estimate = costUsd({
    inputTokens: ESTIMATE.inputTokens * CASES.length,
    outputTokens: ESTIMATE.outputTokens * CASES.length,
  });
  console.log(
    `${CASES.length} cases on ${model}; estimated cost $${estimate.toFixed(4)}`,
  );

  let real: ModelCall | null = null;
  if (!dry) {
    if (estimate > LIMIT_USD) {
      console.error(`Refusing to run: the estimate is over $${LIMIT_USD}.`);
      process.exit(1);
    }
    real = modelCall();
    if (!real) {
      console.error("No ANTHROPIC_API_KEY (or AI_MODE=off). Use --dry-run.");
      process.exit(1);
    }
  }

  type Result = { c: Case; got: string; bad: string[] };
  const results: Result[] = [];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  for (const c of CASES) {
    const call: ModelCall = real
      ? (request) => real!({ ...request, model })
      : standIn(c);
    const reading = await readTypedInput(c.input, call);
    if (reading.status !== "failed") {
      usage.inputTokens += reading.usage.inputTokens;
      usage.outputTokens += reading.usage.outputTokens;
    }
    // A discarded or failed reading is a miss: production would ask again.
    const got = reading.status === "read" ? reading.intent : null;
    results.push({
      c,
      got: got ? JSON.stringify(got) : `(${reading.status})`,
      bad: got ? mismatches(c, got) : ["reading"],
    });
  }

  const categories = [...new Set(CASES.map((c) => c.category))] as Category[];
  const rows = categories.map((cat) => {
    const mine = results.filter((r) => r.c.category === cat);
    const right = mine.filter((r) => r.bad.length === 0).length;
    return { cat, right, total: mine.length };
  });
  const failing = results.filter((r) => r.bad.length > 0);
  const right = results.length - failing.length;
  const spent = costUsd(usage);

  const lines = [
    `# Model evaluation${dry ? " (dry run)" : ""}`,
    "",
    `Model: ${dry ? "stand-in" : model}. Cases: ${results.length}. Correct: ${right} (${Math.round((100 * right) / results.length)}%).`,
    `Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out. Cost: $${spent.toFixed(4)}.`,
    "",
    "| Category | Correct | Cases |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r.cat} | ${r.right} | ${r.total} |`),
    "",
    "## Failing cases",
    "",
    ...(failing.length === 0
      ? ["None."]
      : failing.flatMap((r) => [
          `- "${r.c.input.text}" (${r.c.category}; wrong: ${r.bad.join(", ")})`,
          `  - expected \`${JSON.stringify(r.c.expected)}\``,
          `  - got \`${r.got}\``,
        ])),
    "",
  ];
  const report = lines.join("\n");
  console.log(report);
  if (!dry) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, report);
    console.log(`Wrote ${out}`);
  }
  process.exit(dry && failing.length > 0 ? 1 : 0);
}

void main();
