import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installWorkerShutdownHandlers,
  logWorkerActivity,
  parseWorkerArguments,
  resolveWorkerId,
} from "./runtime";

describe("worker runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses an explicit or host worker identity without leaking other env", () => {
    expect(
      resolveWorkerId(
        {
          PLANNING_WORKER_ID: " worker / primary ",
          DATABASE_URL: "postgresql://secret",
        },
        42,
      ),
    ).toBe("worker---primary");
    expect(resolveWorkerId({ HOSTNAME: "host-1" }, 42)).toBe("host-1");
    expect(resolveWorkerId({}, 42)).toMatch(/^planning-worker-42-/);
  });

  it("supports only the bounded once command switch", () => {
    expect(parseWorkerArguments([])).toEqual({ once: false });
    expect(parseWorkerArguments(["--once"])).toEqual({ once: true });
    expect(() => parseWorkerArguments(["--unsafe"])).toThrow(
      /Unsupported worker argument/,
    );
    expect(() => parseWorkerArguments(["--unsafe"])).toThrow(
      expect.objectContaining({ code: "INVALID_WORKER_ARGUMENT" }),
    );
  });

  it("turns SIGTERM into a graceful stop request and removes handlers", () => {
    const listeners = new Map<
      string | symbol,
      (...arguments_: never[]) => void
    >();
    const once = vi.spyOn(process, "once").mockImplementation(((
      event,
      listener,
    ) => {
      listeners.set(event, listener as (...arguments_: never[]) => void);
      return process;
    }) as typeof process.once);
    const off = vi
      .spyOn(process, "off")
      .mockImplementation((() => process) as typeof process.off);
    const controller = new AbortController();
    const onSignal = vi.fn();
    const cleanup = installWorkerShutdownHandlers(controller, onSignal);

    listeners.get("SIGTERM")?.();

    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe("SIGTERM");
    expect(onSignal).toHaveBeenCalledWith("SIGTERM");
    expect(once).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

    cleanup();
    expect(off).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(off).toHaveBeenCalledWith("SIGINT", expect.any(Function));
  });

  it("emits structured identifiers and stable error codes only", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logWorkerActivity("worker_1", {
      type: "JOB_FINISHED",
      jobId: "job_1",
      tripId: "trip_1",
      attempt: 2,
      outcome: "SUCCEEDED",
      errorCode: null,
      retryScheduled: false,
      attemptDurationMs: 450,
      totalDurationMs: 1_250,
    });
    logWorkerActivity("worker_1", {
      type: "LOOP_ERROR",
      error: Object.assign(new Error("database secret"), {
        code: "P1001",
      }),
    });

    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toEqual({
      event: "planning_worker",
      workerId: "worker_1",
      activity: "JOB_FINISHED",
      jobId: "job_1",
      tripId: "trip_1",
      attempt: 2,
      outcome: "SUCCEEDED",
      errorCode: null,
      retryScheduled: false,
      attemptDurationMs: 450,
      totalDurationMs: 1_250,
    });
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toEqual({
      event: "planning_worker",
      workerId: "worker_1",
      activity: "LOOP_ERROR",
      errorCode: "P1001",
    });
    expect(error.mock.calls[0]?.[0]).not.toContain("database secret");
  });

  it("logs heartbeat failures without exposing database details", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    logWorkerActivity("worker_1", {
      type: "HEARTBEAT_ERROR",
      jobId: "job_1",
      tripId: "trip_1",
      attempt: 1,
      error: Object.assign(new Error("postgresql://private"), {
        code: "P1001",
      }),
    });

    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toEqual({
      event: "planning_worker",
      workerId: "worker_1",
      activity: "HEARTBEAT_ERROR",
      jobId: "job_1",
      tripId: "trip_1",
      attempt: 1,
      errorCode: "P1001",
    });
    expect(error.mock.calls[0]?.[0]).not.toContain("postgresql://private");
  });
});
