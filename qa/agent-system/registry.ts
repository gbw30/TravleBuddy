import {
  qaAgentDefinitionSchema,
  qaAgentSchema,
  qaRunTypeSchema,
  type QaAgent,
  type QaAgentDefinition,
  type QaRunType,
  type QaWorkerAgent,
} from "../contracts/schemas";

export const qaContextMaxBytes = 32 * 1024;
export const rootAgentsMaxBytes = 8 * 1024;
export const agentInstructionsMaxBytes = 2_500;
export const failureExcerptMaxBytes = 4 * 1024;

export const workerAgents = [
  "qa_baseline",
  "qa_journeys",
  "qa_constraints",
  "qa_security_concurrency",
  "qa_resilience_production",
] as const satisfies readonly QaWorkerAgent[];

export const specialistAgents = [
  "qa_journeys",
  "qa_constraints",
  "qa_security_concurrency",
  "qa_resilience_production",
] as const satisfies readonly QaWorkerAgent[];

export const fullAgentTeam = [
  ...workerAgents,
  "qa_auditor",
] as const satisfies readonly QaAgent[];

const sharedDocumentation = [
  "qa/context/shared-policy.md",
  "qa/README.md",
  "docs/conversational-planning/README.md",
];

export const agentRegistry = Object.freeze(
  [
    {
      name: "qa_baseline",
      reasoningEffort: "medium",
      role: "Audit deterministic evidence and identify missing or weak test coverage without rerunning completed checks.",
      documentationPaths: sharedDocumentation,
      sourceRoots: ["package.json", "qa", "src", "prisma"],
      testRoots: ["qa", "src", "prisma", "e2e"],
    },
    {
      name: "qa_journeys",
      reasoningEffort: "medium",
      role: "Verify authenticated desktop and mobile journeys, persistence, navigation, and accessibility.",
      documentationPaths: [...sharedDocumentation, "docs/requirements.md"],
      sourceRoots: ["src/app", "src/components", "e2e"],
      testRoots: ["e2e", "src/components", "src/app"],
    },
    {
      name: "qa_constraints",
      reasoningEffort: "high",
      role: "Find domain invariant, validation, boundary, combination, itinerary, and conflict defects.",
      documentationPaths: [...sharedDocumentation, "docs/requirements.md"],
      sourceRoots: ["src/features", "src/app/api", "prisma"],
      testRoots: ["src/features", "src/app/api", "prisma", "e2e"],
    },
    {
      name: "qa_security_concurrency",
      reasoningEffort: "high",
      role: "Verify authentication, ownership, mutation authorization, replay safety, and bounded concurrency.",
      documentationPaths: [
        ...sharedDocumentation,
        "docs/requirements.md",
        "docs/nextauth-setup.md",
        "docs/conversational-planning/01-foundation-and-contracts.md",
      ],
      sourceRoots: ["src/lib", "src/app/api", "src/features", "src/proxy.ts"],
      testRoots: ["src/lib", "src/app/api", "src/features", "e2e"],
    },
    {
      name: "qa_resilience_production",
      reasoningEffort: "high",
      role: "Verify provider failures, recovery, configuration safety, performance evidence, and production read-only behavior.",
      documentationPaths: [
        ...sharedDocumentation,
        "docs/neon-env-setup.md",
        "docs/conversational-planning/05-real-place-recommendations.md",
        "docs/conversational-planning/06-interaction-performance.md",
        "docs/conversational-planning/07-cache-production-hardening.md",
      ],
      sourceRoots: [
        "src/lib/ai",
        "src/lib/google",
        "src/lib/env.ts",
        "src/lib/db.ts",
        "src/instrumentation.ts",
        "next.config.ts",
        "package.json",
      ],
      testRoots: ["src/lib", "e2e", "qa"],
    },
    {
      name: "qa_auditor",
      reasoningEffort: "high",
      role: "Validate worker evidence, inspect primary evidence selectively, deduplicate findings, and apply the gate policy.",
      documentationPaths: [
        ...sharedDocumentation,
        "qa/docs/agent-system.md",
        "qa/docs/context-refinements.md",
      ],
      sourceRoots: ["qa", ".codex/agents", ".github/codex"],
      testRoots: ["qa"],
    },
  ].map((definition) => qaAgentDefinitionSchema.parse(definition)),
) satisfies readonly QaAgentDefinition[];

export const agentRegistryByName = new Map(
  agentRegistry.map((agent) => [agent.name, agent]),
);

type RouteRule = {
  id: string;
  agent: (typeof specialistAgents)[number];
  prefixes?: readonly string[];
  exact?: readonly string[];
  includes?: readonly string[];
  suffixes?: readonly string[];
};

const routeRules: readonly RouteRule[] = [
  {
    id: "user-journeys",
    agent: "qa_journeys",
    prefixes: [
      "src/app/(auth)/",
      "src/app/(dashboard)/",
      "src/components/",
      "e2e/",
    ],
    exact: [
      "src/app/page.tsx",
      "src/app/layout.tsx",
      "src/app/globals.css",
      "playwright.config.ts",
    ],
    suffixes: [".css"],
  },
  {
    id: "domain-constraints",
    agent: "qa_constraints",
    prefixes: [
      "src/features/trips/",
      "src/features/profile/",
      "src/features/preferences/",
      "src/features/recommendations/",
      "src/features/itinerary/",
      "src/features/planning/",
      "src/app/api/trips/",
      "src/app/api/recommendations/",
      "src/app/api/itinerary/",
    ],
    exact: ["prisma/schema.prisma", "prisma/stage0-schema.test.ts"],
    includes: ["validation", "conflict", "logistic", "itinerary"],
  },
  {
    id: "security-concurrency",
    agent: "qa_security_concurrency",
    prefixes: ["src/app/(auth)/", "src/app/api/"],
    exact: ["src/proxy.ts"],
    includes: [
      "/auth",
      "authorization",
      "actions.ts",
      "revision",
      "concurrency",
      "idempot",
    ],
  },
  {
    id: "resilience-production",
    agent: "qa_resilience_production",
    prefixes: ["src/lib/ai/", "src/lib/google/", ".github/workflows/"],
    exact: [
      "src/lib/env.ts",
      "src/lib/env.test.ts",
      "src/lib/db.ts",
      "src/lib/db.test.ts",
      "src/instrumentation.ts",
      "next.config.ts",
      "package.json",
      "package-lock.json",
      ".env.example",
    ],
    includes: ["provider", "cache", "redis", "rate-limit", "observability"],
  },
];

const fullTeamExactPaths = new Set([
  "AGENTS.md",
  ".codex/config.toml",
  "qa/feature-states.json",
  "docs/requirements.md",
]);

const fullTeamPrefixes = [
  ".codex/agents/",
  ".github/codex/",
  ".github/workflows/qa-",
  "qa/agent-system/",
  "qa/context/",
  "qa/contracts/",
  "qa/scenarios/",
  "prisma/migrations/",
  "docs/conversational-planning/",
];

function normalizeChangedPath(value: string) {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function matchesRule(file: string, rule: RouteRule) {
  return Boolean(
    rule.exact?.includes(file) ||
      rule.prefixes?.some((prefix) => file.startsWith(prefix)) ||
      rule.includes?.some((part) => file.includes(part)) ||
      rule.suffixes?.some((suffix) => file.endsWith(suffix)),
  );
}

function isDocumentationOnly(file: string) {
  return file.endsWith(".md") || file.startsWith("docs/");
}

export type AgentSelection = {
  selectedAgents: QaAgent[];
  reasons: string[];
  forcedAgents: QaAgent[];
};

export function parseForcedAgents(value: string | undefined): QaAgent[] {
  if (!value?.trim()) return [];
  if (value.trim().toLocaleLowerCase() === "all") return [...fullAgentTeam];

  const parsed = value
    .split(",")
    .map((entry) => qaAgentSchema.parse(entry.trim()))
    .filter((agent, index, agents) => agents.indexOf(agent) === index);

  return parsed;
}

function orderedAgents(agents: ReadonlySet<QaAgent>) {
  return fullAgentTeam.filter((agent) => agents.has(agent));
}

export function selectAgentsForChanges(options: {
  runType: QaRunType;
  changedPaths: readonly string[] | null;
  forcedAgents?: readonly QaAgent[];
}): AgentSelection {
  const runType = qaRunTypeSchema.parse(options.runType);
  const forcedAgents = [...(options.forcedAgents ?? [])];

  if (runType === "nightly" || runType === "release") {
    return {
      selectedAgents: [...fullAgentTeam],
      reasons: [`${runType} runs always use the full QA agent team.`],
      forcedAgents: [],
    };
  }

  if (runType === "production") {
    return {
      selectedAgents: [
        "qa_security_concurrency",
        "qa_resilience_production",
        "qa_auditor",
      ],
      reasons: [
        "Production runs use only read-only security, resilience, and audit roles.",
      ],
      forcedAgents: [],
    };
  }

  if (options.changedPaths === null) {
    return {
      selectedAgents: [...fullAgentTeam],
      reasons: [
        "QA_BASE_SHA was unavailable, so PR routing fell back to the full team.",
      ],
      forcedAgents,
    };
  }

  const changedPaths = options.changedPaths.map(normalizeChangedPath);
  const selected = new Set<QaAgent>(["qa_baseline", "qa_auditor"]);
  const reasons = ["PR routing always includes qa_baseline and qa_auditor."];

  const fullTeamPath = changedPaths.find(
    (file) =>
      fullTeamExactPaths.has(file) ||
      fullTeamPrefixes.some((prefix) => file.startsWith(prefix)),
  );
  if (fullTeamPath) {
    return {
      selectedAgents: [...fullAgentTeam],
      reasons: [
        ...reasons,
        `${fullTeamPath} changes QA policy, requirements, contracts, migrations, or orchestration.`,
      ],
      forcedAgents,
    };
  }

  const unknownPaths: string[] = [];
  for (const file of changedPaths) {
    const matchedRules = routeRules.filter((rule) => matchesRule(file, rule));
    if (matchedRules.length === 0 && !isDocumentationOnly(file)) {
      unknownPaths.push(file);
      continue;
    }
    for (const rule of matchedRules) {
      selected.add(rule.agent);
      reasons.push(`${file} matched ${rule.id} -> ${rule.agent}.`);
    }
  }

  if (unknownPaths.length > 0) {
    return {
      selectedAgents: [...fullAgentTeam],
      reasons: [
        ...reasons,
        `Unknown changed paths require the full team: ${unknownPaths.join(", ")}.`,
      ],
      forcedAgents,
    };
  }

  for (const agent of forcedAgents) selected.add(agent);
  if (forcedAgents.length > 0) {
    reasons.push(
      `QA_FORCE_AGENTS augmented the PR selection with ${forcedAgents.join(", ")}.`,
    );
  }

  const selectedSpecialists = specialistAgents.filter((agent) =>
    selected.has(agent),
  );
  if (selectedSpecialists.length >= 3) {
    return {
      selectedAgents: [...fullAgentTeam],
      reasons: [
        ...reasons,
        "Three or more specialist domains were affected, so routing expanded to the full team.",
      ],
      forcedAgents,
    };
  }

  if (changedPaths.length === 0) {
    reasons.push("No changed paths were reported; only baseline and audit roles are needed.");
  } else if (selectedSpecialists.length === 0) {
    reasons.push("Only non-requirement documentation changed.");
  }

  return {
    selectedAgents: orderedAgents(selected),
    reasons: [...new Set(reasons)],
    forcedAgents,
  };
}
