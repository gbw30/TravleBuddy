import {
  createGenerationJobHandlers,
  loadProcessFeedbackEventJob,
} from "./handlers";
import { loadEnvConfig } from "@next/env";
import {
  installWorkerShutdownHandlers,
  parseWorkerArguments,
  resolveWorkerId,
  runPlanningWorker,
} from "./runtime";
import { validateWorkerEnv } from "@/lib/env";
import { disconnectDb } from "@/lib/db";

async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  validateWorkerEnv();
  const arguments_ = parseWorkerArguments(process.argv.slice(2));
  const workerId = resolveWorkerId();
  const shutdown = new AbortController();
  const removeShutdownHandlers = installWorkerShutdownHandlers(
    shutdown,
    (signal) => {
      console.info(
        JSON.stringify({
          event: "planning_worker",
          workerId,
          activity: "SHUTDOWN_REQUESTED",
          signal,
        }),
      );
    },
  );

  try {
    const processFeedbackEventJob = await loadProcessFeedbackEventJob();
    const handlers = createGenerationJobHandlers(processFeedbackEventJob);
    await runPlanningWorker({
      handlers,
      workerId,
      once: arguments_.once,
      signal: shutdown.signal,
    });
  } finally {
    removeShutdownHandlers();
    await disconnectDb();
  }
}

void main().catch((error: unknown) => {
  const candidate =
    error && typeof error === "object"
      ? (error as { code?: unknown; name?: unknown })
      : null;
  const errorCode =
    (typeof candidate?.code === "string" && candidate.code) ||
    (typeof candidate?.name === "string" &&
      candidate.name !== "Error" &&
      candidate.name) ||
    "WORKER_STARTUP_FAILED";

  console.error(
    JSON.stringify({
      event: "planning_worker",
      activity: "FATAL",
      errorCode: errorCode.slice(0, 64),
    }),
  );
  process.exitCode = 1;
});
