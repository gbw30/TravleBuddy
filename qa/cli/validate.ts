import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";
import { buildAgentContext, serializeBoundedContext } from "../agent-system/context";
import {
  agentInstructionsMaxBytes,
  agentRegistry,
  agentRegistryByName,
  fullAgentTeam,
  rootAgentsMaxBytes,
} from "../agent-system/registry";
import {
  featureRegistry,
  featureRegistrySchema,
  qaAgentSchema,
} from "../contracts";
import { scenarioCatalog, validateScenarioCatalog } from "../scenarios";

const root = process.cwd();
const agentDirectory = path.join(root, ".codex", "agents");
const workflowDirectory = path.join(root, ".github", "workflows");

async function assertPathExists(relativePath: string) {
  try {
    await stat(path.join(root, relativePath));
  } catch {
    throw new Error(`Referenced QA path does not exist: ${relativePath}`);
  }
}

async function validateAgentFiles() {
  const expectedAgents = qaAgentSchema.options;
  const agentFiles = (await readdir(agentDirectory))
    .filter((file) => file.endsWith(".toml"))
    .sort();
  const expectedFiles = expectedAgents.map((agent) => `${agent}.toml`).sort();
  if (agentFiles.join("|") !== expectedFiles.join("|")) {
    throw new Error(
      `Custom QA agents must exactly match: ${expectedFiles.join(", ")}.`,
    );
  }

  for (const agentName of expectedAgents) {
    const fileName = `${agentName}.toml`;
    const raw = await readFile(path.join(agentDirectory, fileName), "utf8");
    const parsed = parseToml(raw) as Record<string, unknown>;
    const definition = agentRegistryByName.get(agentName);
    if (!definition) throw new Error(`Missing typed agent definition: ${agentName}`);
    if (parsed.name !== agentName) {
      throw new Error(`${fileName} must declare name = "${agentName}".`);
    }
    for (const field of ["description", "developer_instructions"] as const) {
      if (typeof parsed[field] !== "string" || !parsed[field].trim()) {
        throw new Error(`${fileName} is missing ${field}.`);
      }
    }
    if (parsed.model !== undefined || parsed.sandbox_mode !== undefined) {
      throw new Error(`${fileName} must inherit model and sandbox from its parent.`);
    }
    if (parsed.model_reasoning_effort !== definition.reasoningEffort) {
      throw new Error(
        `${fileName} must use reasoning effort ${definition.reasoningEffort}.`,
      );
    }
    const instructionBytes = Buffer.byteLength(
      parsed.developer_instructions as string,
      "utf8",
    );
    if (instructionBytes > agentInstructionsMaxBytes) {
      throw new Error(
        `${fileName} instructions are ${instructionBytes} bytes; maximum is ${agentInstructionsMaxBytes}.`,
      );
    }
  }
}

async function validateCodexConfiguration() {
  const codexConfig = parseToml(
    await readFile(path.join(root, ".codex", "config.toml"), "utf8"),
  ) as { agents?: { max_threads?: unknown; max_depth?: unknown } };
  if (
    codexConfig.agents?.max_threads !== 4 ||
    codexConfig.agents?.max_depth !== 1
  ) {
    throw new Error(
      "Codex QA orchestration requires max_threads=4 and max_depth=1.",
    );
  }

  const agentsPath = path.join(root, "AGENTS.md");
  const agents = await readFile(agentsPath, "utf8");
  const agentsBytes = Buffer.byteLength(agents, "utf8");
  if (agentsBytes > rootAgentsMaxBytes) {
    throw new Error(
      `AGENTS.md is ${agentsBytes} bytes; maximum is ${rootAgentsMaxBytes}.`,
    );
  }
  if (
    !agents.includes("<!-- BEGIN:nextjs-agent-rules -->") ||
    !agents.includes("node_modules/next/dist/docs/")
  ) {
    throw new Error("AGENTS.md must preserve the bundled Next.js guidance rule.");
  }
}

async function validateReferencedPathsAndContexts() {
  for (const definition of agentRegistry) {
    for (const referencedPath of [
      ...definition.documentationPaths,
      ...definition.sourceRoots,
      ...definition.testRoots,
    ]) {
      await assertPathExists(referencedPath);
    }
    serializeBoundedContext(
      buildAgentContext({
        run: {
          runId: "validate-context",
          runType: "release",
          targetKind: "preview",
          activeStage: "validation",
          commitSha: "abcdef0",
          baseSha: null,
          changedPaths: null,
          forcedAgents: [],
          parentSandbox: "read-only",
          generatedAt: "2026-07-21T00:00:00.000Z",
        },
        selectedAgents: fullAgentTeam,
        selectionReasons: ["Validation sample uses the full team."],
        agent: definition.name,
      }),
    );
  }
}

async function validateWorkflows() {
  const workflowFiles = (await readdir(workflowDirectory)).filter((file) =>
    /^(ci|qa-.+)\.ya?ml$/.test(file),
  );
  for (const file of workflowFiles) {
    const raw = await readFile(path.join(workflowDirectory, file), "utf8");
    const document = parseDocument(raw);
    if (document.errors.length > 0) {
      throw new Error(
        `${file} contains invalid YAML: ${document.errors
          .map((error) => error.message)
          .join("; ")}`,
      );
    }

    if (raw.includes("openai/codex-action@v1")) {
      if (!raw.includes("sandbox: read-only")) {
        throw new Error(`${file} must run Codex with sandbox: read-only.`);
      }
      if (!raw.includes("permissions:\n  contents: read")) {
        throw new Error(`${file} must grant repository-read permissions only.`);
      }
      if (!raw.includes("actions/upload-artifact@v4")) {
        throw new Error(`${file} must upload the Codex result as an artifact.`);
      }
      const promptPaths = [...raw.matchAll(/prompt-file:\s*([^\s#]+)/g)].map(
        (match) => match[1],
      );
      if (promptPaths.length === 0) {
        throw new Error(`${file} must use a committed Codex prompt file.`);
      }
      for (const promptPath of promptPaths) await assertPathExists(promptPath);
    }
  }
  return workflowFiles.length;
}

async function main() {
  featureRegistrySchema.parse(featureRegistry);
  validateScenarioCatalog(scenarioCatalog);
  const coveredFeatures = new Set(
    scenarioCatalog.map((scenario) => scenario.feature),
  );
  const missingFeatureCoverage = featureRegistry
    .filter((feature) => !coveredFeatures.has(feature.id))
    .map((feature) => feature.id);
  if (missingFeatureCoverage.length > 0) {
    throw new Error(
      `Features without registered scenarios: ${missingFeatureCoverage.join(", ")}`,
    );
  }
  for (const scenario of scenarioCatalog) {
    if (!agentRegistryByName.has(scenario.owningAgent)) {
      throw new Error(
        `Scenario ${scenario.id} has unknown owner ${scenario.owningAgent}.`,
      );
    }
  }

  await validateAgentFiles();
  await validateCodexConfiguration();
  await validateReferencedPathsAndContexts();
  const workflowCount = await validateWorkflows();
  const featureStates = Object.fromEntries(
    ["required", "candidate", "planned", "deferred"].map((state) => [
      state,
      featureRegistry.filter((feature) => feature.state === state).length,
    ]),
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "valid",
        features: featureRegistry.length,
        featureStates,
        scenarios: scenarioCatalog.length,
        agents: qaAgentSchema.options.length,
        workflows: workflowCount,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
