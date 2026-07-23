import { z } from "zod";

export const featureStateSchema = z.enum([
  "required",
  "candidate",
  "planned",
  "deferred",
]);

export const featureIdSchema = z.enum([
  "authentication",
  "profile",
  "trip-crud",
  "trip-preferences",
  "mock-recommendations",
  "planning-feedback",
  "itinerary-draft",
  "conflicts",
  "logistics",
  "planning-revision-contracts",
  "conversation-persistence",
  "ai-intent",
  "live-scheduling",
  "google-places",
  "interaction-performance",
  "cache-rate-limits",
  "maps",
  "export",
]);

export const qaEnvironmentSchema = z.enum(["local", "preview", "production"]);
export const qaRunTypeSchema = z.enum([
  "pr",
  "nightly",
  "release",
  "production",
]);
export const qaVerdictSchema = z.enum(["PASS", "FAIL", "BLOCKED"]);
export const scenarioPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export const executionKindSchema = z.enum([
  "unit",
  "integration",
  "browser",
  "manual",
  "agent",
]);
export const qaAgentSchema = z.enum([
  "qa_baseline",
  "qa_journeys",
  "qa_constraints",
  "qa_security_concurrency",
  "qa_resilience_production",
  "qa_auditor",
]);
export const qaWorkerAgentSchema = z.enum([
  "qa_baseline",
  "qa_journeys",
  "qa_constraints",
  "qa_security_concurrency",
  "qa_resilience_production",
]);
export const qaReasoningEffortSchema = z.enum(["medium", "high"]);
export const qaParentSandboxSchema = z.enum(["workspace-write", "read-only"]);
export const qaOutputModeSchema = z.enum(["artifacts", "final-response"]);

export const featureDefinitionSchema = z
  .object({
    id: featureIdSchema,
    label: z.string().trim().min(1),
    state: featureStateSchema,
    documentedStage: z.string().trim().min(1),
    description: z.string().trim().min(1),
  })
  .strict();

export const featureRegistrySchema = z
  .array(featureDefinitionSchema)
  .min(1)
  .superRefine((features, context) => {
    const seen = new Set<string>();

    for (const feature of features) {
      if (seen.has(feature.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate feature id: ${feature.id}`,
        });
      }
      seen.add(feature.id);
    }

    for (const id of featureIdSchema.options) {
      if (!seen.has(id)) {
        context.addIssue({
          code: "custom",
          message: `Feature registry is missing: ${id}`,
        });
      }
    }
  });

export const scenarioSchema = z
  .object({
    id: z.string().regex(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/),
    title: z.string().trim().min(1),
    feature: featureIdSchema,
    documentedStage: z.string().trim().min(1),
    priority: scenarioPrioritySchema,
    environments: z.array(qaEnvironmentSchema).min(1),
    executionKind: executionKindSchema,
    destructive: z.boolean(),
    fixtureProfile: z.string().trim().min(1),
    owningAgent: qaAgentSchema,
    tags: z.array(z.string().trim().min(1)).min(1),
    expectedInvariants: z.array(z.string().trim().min(1)).min(1),
  })
  .strict()
  .superRefine((scenario, context) => {
    if (scenario.destructive && scenario.environments.includes("production")) {
      context.addIssue({
        code: "custom",
        path: ["environments"],
        message: "Destructive scenarios must never target production",
      });
    }

    if (new Set(scenario.environments).size !== scenario.environments.length) {
      context.addIssue({
        code: "custom",
        path: ["environments"],
        message: "Scenario environments must be unique",
      });
    }
  });

export const scenarioCatalogSchema = z
  .array(scenarioSchema)
  .min(1)
  .superRefine((scenarios, context) => {
    const seen = new Set<string>();
    for (const scenario of scenarios) {
      if (seen.has(scenario.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate scenario id: ${scenario.id}`,
        });
      }
      seen.add(scenario.id);
    }
  });

export const findingSeveritySchema = z.enum([
  "blocker",
  "critical",
  "major",
  "minor",
]);
export const findingConfidenceSchema = z.enum([
  "confirmed",
  "high",
  "medium",
  "low",
]);

export const findingSchema = z
  .object({
    id: z.string().regex(/^FIND-[A-Z0-9-]+$/),
    severity: findingSeveritySchema,
    confidence: findingConfidenceSchema,
    scenarioId: scenarioSchema.shape.id,
    environment: qaEnvironmentSchema,
    expectedBehavior: z.string().trim().min(1),
    actualBehavior: z.string().trim().min(1),
    reproductionSteps: z.array(z.string().trim().min(1)).min(1),
    evidencePaths: z.array(z.string().trim().min(1)),
    affectedSurface: z.string().trim().min(1),
    productionImpact: z.string().trim().min(1),
    workaround: z.string().trim().min(1).nullable(),
    duplicateOf: z.string().regex(/^FIND-[A-Z0-9-]+$/).nullable(),
  })
  .strict()
  .superRefine((finding, context) => {
    if (finding.duplicateOf === finding.id) {
      context.addIssue({
        code: "custom",
        path: ["duplicateOf"],
        message: "A finding cannot duplicate itself",
      });
    }

    if (
      finding.confidence === "confirmed" &&
      finding.evidencePaths.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidencePaths"],
        message: "Confirmed findings require evidence",
      });
    }
  });

export const commandResultSchema = z
  .object({
    name: z.string().trim().min(1),
    command: z.string().trim().min(1),
    status: z.enum(["passed", "failed", "blocked", "skipped"]),
    exitCode: z.number().int().nullable(),
    durationMs: z.number().int().nonnegative(),
    evidencePaths: z.array(z.string().trim().min(1)),
  })
  .strict();

export const scenarioExecutionSchema = z
  .object({
    scenarioId: scenarioSchema.shape.id,
    environment: qaEnvironmentSchema,
    status: z.enum(["passed", "failed", "blocked", "skipped"]),
    attempts: z.number().int().min(1),
    durationMs: z.number().int().nonnegative(),
    evidencePaths: z.array(z.string().trim().min(1)),
    details: z.string().trim().min(1),
    blockingReason: z.string().trim().min(1).nullable(),
  })
  .strict()
  .superRefine((execution, context) => {
    const requiresReason = ["blocked", "skipped"].includes(execution.status);
    if (requiresReason && execution.blockingReason === null) {
      context.addIssue({
        code: "custom",
        path: ["blockingReason"],
        message: "Blocked and skipped executions require a reason",
      });
    }
  });

export const coverageSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((coverage, context) => {
    const resultTotal =
      coverage.passed +
      coverage.failed +
      coverage.blocked +
      coverage.skipped;
    if (coverage.total !== resultTotal) {
      context.addIssue({
        code: "custom",
        path: ["total"],
        message: "Coverage total must equal all result counts",
      });
    }
  });

export const environmentBlockerSchema = z
  .object({
    id: z.string().regex(/^BLOCK-[A-Z0-9-]+$/),
    kind: z.enum([
      "infrastructure",
      "credentials",
      "deployment",
      "safety",
      "provider",
    ]),
    reason: z.string().trim().min(1),
    affectedScenarioIds: z.array(scenarioSchema.shape.id),
    required: z.boolean(),
  })
  .strict();

export const quarantineSchema = z
  .object({
    scenarioId: scenarioSchema.shape.id,
    reason: z.string().trim().min(1),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    approvedBy: z.string().trim().min(1),
  })
  .strict()
  .superRefine((quarantine, context) => {
    const createdAt = new Date(quarantine.createdAt).getTime();
    const expiresAt = new Date(quarantine.expiresAt).getTime();
    const maximumDuration = 7 * 24 * 60 * 60 * 1000;

    if (expiresAt <= createdAt || expiresAt - createdAt > maximumDuration) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "A quarantine must expire after creation and within seven days",
      });
    }
  });

export const qaTargetSchema = z
  .object({
    kind: qaEnvironmentSchema,
    baseUrl: z.string().url(),
    databaseFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    writesAllowed: z.boolean(),
    safetyVerified: z.boolean(),
  })
  .strict();

export const qaAgentDefinitionSchema = z
  .object({
    name: qaAgentSchema,
    reasoningEffort: qaReasoningEffortSchema,
    role: z.string().trim().min(1),
    documentationPaths: z.array(z.string().trim().min(1)),
    sourceRoots: z.array(z.string().trim().min(1)),
    testRoots: z.array(z.string().trim().min(1)),
  })
  .strict();

export const qaUsageMetricSchema = z
  .object({
    wallTimeMs: z.number().int().nonnegative(),
    artifactBytes: z.number().int().nonnegative(),
    scenarioCount: z.number().int().nonnegative(),
    duplicateFindingCount: z.number().int().nonnegative(),
    uniqueConfirmedFindingCount: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    cachedInputTokens: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const qaAgentContextSchema = z
  .object({
    contractVersion: z.literal(1),
    runId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/),
    generatedAt: z.string().datetime({ offset: true }),
    commitSha: z.string().regex(/^[a-fA-F0-9]{7,40}$/),
    activeStage: z.string().trim().min(1),
    runType: qaRunTypeSchema,
    targetKind: qaEnvironmentSchema,
    agent: qaAgentSchema,
    selectedAgents: z.array(qaAgentSchema).min(1),
    selectionReasons: z.array(z.string().trim().min(1)).min(1),
    assignedScenarios: z.array(scenarioSchema),
    blockingScenarioIds: z.array(scenarioSchema.shape.id),
    relevantFeatures: z.array(featureDefinitionSchema),
    documentationPaths: z.array(z.string().trim().min(1)),
    sourceRoots: z.array(z.string().trim().min(1)),
    testRoots: z.array(z.string().trim().min(1)),
    evidenceInputs: z.array(z.string().trim().min(1)),
    outputDirectory: z.string().trim().min(1),
    exclusions: z.array(z.string().trim().min(1)),
    permissions: z
      .object({
        reportOnly: z.literal(true),
        trackedWritesAllowed: z.literal(false),
        productionReadOnly: z.boolean(),
        parentSandbox: qaParentSandboxSchema,
        outputMode: qaOutputModeSchema,
      })
      .strict(),
  })
  .strict();

export const qaContextManifestSchema = z
  .object({
    contractVersion: z.literal(1),
    runId: qaAgentContextSchema.shape.runId,
    generatedAt: qaAgentContextSchema.shape.generatedAt,
    commitSha: qaAgentContextSchema.shape.commitSha,
    activeStage: qaAgentContextSchema.shape.activeStage,
    runType: qaRunTypeSchema,
    targetKind: qaEnvironmentSchema,
    baseSha: z.string().regex(/^[a-fA-F0-9]{7,40}$/).nullable(),
    changedPaths: z.array(z.string()).nullable(),
    selectedAgents: z.array(qaAgentSchema).min(1),
    selectionReasons: z.array(z.string().trim().min(1)).min(1),
    forcedAgents: z.array(qaAgentSchema),
    deterministicReportPath: z.string().trim().min(1),
    agentBundlePaths: z.partialRecord(
      qaAgentSchema,
      z.string().trim().min(1),
    ),
    contextBytesByAgent: z.partialRecord(
      qaAgentSchema,
      z.number().int().positive(),
    ),
  })
  .strict();

export const qaWorkerReportSchema = z
  .object({
    reportVersion: z.literal(1),
    runId: qaAgentContextSchema.shape.runId,
    generatedAt: qaAgentContextSchema.shape.generatedAt,
    commitSha: qaAgentContextSchema.shape.commitSha,
    runType: qaRunTypeSchema,
    target: qaTargetSchema,
    agent: qaWorkerAgentSchema,
    verdict: qaVerdictSchema,
    assignedScenarioIds: z.array(scenarioSchema.shape.id),
    scenarioExecutions: z.array(scenarioExecutionSchema),
    findings: z.array(findingSchema),
    environmentBlockers: z.array(environmentBlockerSchema),
    flakyScenarioIds: z.array(scenarioSchema.shape.id),
    sourcePaths: z.array(z.string().trim().min(1)),
    evidencePaths: z.array(z.string().trim().min(1)),
    redactionConfirmed: z.boolean(),
    usage: qaUsageMetricSchema.optional(),
  })
  .strict();

export const qaEvidenceIndexEntrySchema = z
  .object({
    path: z.string().trim().min(1),
    owner: qaWorkerAgentSchema,
    scenarioIds: z.array(scenarioSchema.shape.id),
    mediaType: z.string().trim().min(1),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    redactionState: z.enum(["verified", "reported", "unknown"]),
  })
  .strict();

export const qaEvidenceIndexSchema = z
  .object({
    contractVersion: z.literal(1),
    runId: qaAgentContextSchema.shape.runId,
    generatedAt: qaAgentContextSchema.shape.generatedAt,
    entries: z.array(qaEvidenceIndexEntrySchema),
  })
  .strict();

export const qaWorkerSummarySchema = z
  .object({
    agent: qaWorkerAgentSchema,
    status: z.enum(["PASS", "FAIL", "BLOCKED", "MISSING", "INVALID"]),
    assignedScenarioCount: z.number().int().nonnegative(),
    executedScenarioCount: z.number().int().nonnegative(),
    findingIds: z.array(findingSchema.shape.id),
    confirmedFindingIds: z.array(findingSchema.shape.id),
    flakyScenarioIds: z.array(scenarioSchema.shape.id),
    blockerIds: z.array(environmentBlockerSchema.shape.id),
    evidenceCount: z.number().int().nonnegative(),
    reportPath: z.string().trim().min(1),
    error: z.string().trim().min(1).nullable(),
    usage: qaUsageMetricSchema.nullable(),
  })
  .strict();

export const qaRunSummarySchema = z
  .object({
    contractVersion: z.literal(1),
    runId: qaAgentContextSchema.shape.runId,
    generatedAt: qaAgentContextSchema.shape.generatedAt,
    commitSha: qaAgentContextSchema.shape.commitSha,
    runType: qaRunTypeSchema,
    selectedAgents: z.array(qaAgentSchema),
    workers: z.array(qaWorkerSummarySchema),
    missingReports: z.array(qaWorkerAgentSchema),
    invalidReports: z.array(qaWorkerAgentSchema),
    primaryEvidenceFindingIds: z.array(findingSchema.shape.id),
    primaryEvidenceScenarioIds: z.array(scenarioSchema.shape.id),
    evidenceIndexPath: z.string().trim().min(1),
  })
  .strict();

export const qaRunEvidenceSchema = z
  .object({
    reportVersion: z.literal(1),
    runId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/),
    generatedAt: z.string().datetime({ offset: true }),
    commitSha: z.string().regex(/^[a-fA-F0-9]{7,40}$/),
    activeStage: z.string().trim().min(1),
    runType: qaRunTypeSchema,
    target: qaTargetSchema,
    commands: z.array(commandResultSchema),
    coverage: coverageSummarySchema,
    scenarioExecutions: z.array(scenarioExecutionSchema),
    findings: z.array(findingSchema),
    skippedScenarioIds: z.array(scenarioSchema.shape.id),
    environmentBlockers: z.array(environmentBlockerSchema),
    quarantines: z.array(quarantineSchema),
  })
  .strict();

export const gateDecisionSchema = z
  .object({
    verdict: qaVerdictSchema,
    reasons: z.array(z.string().trim().min(1)),
    blockingScenarioIds: z.array(scenarioSchema.shape.id),
    nonBlockingFindingIds: z.array(findingSchema.shape.id),
  })
  .strict();

export const qaRunReportSchema = qaRunEvidenceSchema.extend({
  decision: gateDecisionSchema,
});

export type FeatureState = z.infer<typeof featureStateSchema>;
export type FeatureId = z.infer<typeof featureIdSchema>;
export type FeatureDefinition = z.infer<typeof featureDefinitionSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type QaEnvironment = z.infer<typeof qaEnvironmentSchema>;
export type QaAgent = z.infer<typeof qaAgentSchema>;
export type QaWorkerAgent = z.infer<typeof qaWorkerAgentSchema>;
export type QaRunType = z.infer<typeof qaRunTypeSchema>;
export type QaParentSandbox = z.infer<typeof qaParentSandboxSchema>;
export type QaAgentDefinition = z.infer<typeof qaAgentDefinitionSchema>;
export type QaUsageMetric = z.infer<typeof qaUsageMetricSchema>;
export type QaAgentContext = z.infer<typeof qaAgentContextSchema>;
export type QaContextManifest = z.infer<typeof qaContextManifestSchema>;
export type QaWorkerReport = z.infer<typeof qaWorkerReportSchema>;
export type QaEvidenceIndexEntry = z.infer<typeof qaEvidenceIndexEntrySchema>;
export type QaEvidenceIndex = z.infer<typeof qaEvidenceIndexSchema>;
export type QaRunSummary = z.infer<typeof qaRunSummarySchema>;
export type QaRunEvidence = z.infer<typeof qaRunEvidenceSchema>;
export type QaRunReport = z.infer<typeof qaRunReportSchema>;
export type GateDecision = z.infer<typeof gateDecisionSchema>;
