import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { costUsd, type TokenUsage } from "@/features/conversation/model/budget";
import { modelCall, type ModelCall } from "@/features/conversation/model/mode";
import {
  MODEL,
  readTypedInput,
} from "@/features/conversation/model/read-typed";
import type { Intent } from "@/features/conversation/contracts";
import {
  wordSentences,
  WORDING_BUDGET_MS,
} from "@/features/conversation/model/word";
import { checkWording } from "@/features/conversation/model/word-check";
import { fill } from "@/lib/wording";

import { CASES, type Case, type Category } from "./cases";
import { WORDING_CASES } from "./wording-cases";

// Measures how well the AI model reads typed messages into intents, through
// the same function production calls (readTypedInput). Each case in cases.ts
// is read once and graded field by field against the expected intent.
//
//   npx tsx scripts/model-eval/run.ts --dry-run          (no network)
//   ANTHROPIC_API_KEY=... npx tsx scripts/model-eval/run.ts [--model <id>]
//   npx tsx scripts/model-eval/run.ts --wording [--dry-run]   (rewording and its check)
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

/** The wording evaluation: each case is worded once and put through the check. */
async function wordingMain() {
  const real = dry ? null : modelCall();
  if (!dry && !real) {
    console.error("No ANTHROPIC_API_KEY (or AI_MODE=off). Use --dry-run.");
    process.exit(1);
  }
  const outFile = "docs/quality/model-eval-wording.md";
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const rows: { name: string; kind: string; outcome: string; ok: boolean }[] =
    [];
  for (const c of WORDING_CASES) {
    const call: ModelCall =
      real ??
      (async () =>
        ({
          stop_reason: "end_turn",
          content: [
            { type: "text", text: JSON.stringify({ versions: [c.dry] }) },
          ],
          usage: { input_tokens: 400, output_tokens: 40 },
        }) as Awaited<ReturnType<ModelCall>>);
    const wording = await wordSentences(
      [c.sentences],
      call,
      // A real run is not a reader waiting: it gets longer than the budget.
      AbortSignal.timeout(WORDING_BUDGET_MS * 4),
    );
    if (wording.usage) {
      usage.inputTokens += wording.usage.inputTokens;
      usage.outputTokens += wording.usage.outputTokens;
    }
    if (wording.status !== "worded") {
      rows.push({
        name: c.name,
        kind: c.kind,
        outcome: wording.status,
        ok: false,
      });
      continue;
    }
    const versions = wording.versions[0];
    const check = c.sentences
      .map(({ text }, j) => checkWording(text, versions[j]))
      .find((found) => found !== null);
    // An accepted version must also fill: its gaps all have facts.
    if (!check)
      c.sentences.forEach((made, j) => fill({ ...made, text: versions[j] }));
    rows.push({
      name: c.name,
      kind: c.kind,
      outcome: check ?? "accepted",
      // A dry run grades the check against what it must say; a real run only
      // reports what the model did.
      ok: dry ? (check ?? null) === c.expect : true,
    });
  }
  const accepted = rows.filter((r) => r.outcome === "accepted").length;
  const tempt = rows.filter((r) => r.kind === "tempt");
  const report = [
    `# Wording evaluation${dry ? " (dry run)" : ""}`,
    "",
    `Model: ${dry ? "stand-in" : MODEL}. Cases: ${rows.length}. Accepted by the check: ${accepted} (${Math.round((100 * accepted) / rows.length)}%).`,
    `Tempting cases: ${tempt.length}; accepted: ${tempt.filter((r) => r.outcome === "accepted").length}.`,
    `Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out. Cost: $${costUsd(usage).toFixed(4)}.`,
    "",
    "| Case | Kind | Check says | As expected |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.kind} | ${r.outcome} | ${r.ok ? "yes" : "NO"} |`,
    ),
    "",
  ].join("\n");
  console.log(report);
  if (!dry) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, report);
    console.log(`Wrote ${outFile}`);
  }
  process.exit(rows.some((r) => !r.ok) ? 1 : 0);
}

async function main() {
  if (args.includes("--wording")) return wordingMain();
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
