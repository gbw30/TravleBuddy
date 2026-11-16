import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_JOB_ATTEMPTS,
  JOB_HEARTBEAT_INTERVAL_MS,
  JOB_LEASE_DURATION_MS,
  JOB_RETRY_DELAYS_MS,
  canTransitionJobStatus,
  failureDisposition,
  isExpiredRunningClaim,
  isTerminalJobStatus,
  leaseExpiresAt,
  retryDelayMs,
} from "./policy";

describe("job policy", () => {
  it("uses the documented retry, heartbeat, lease, and attempt limits", () => {
    expect(JOB_RETRY_DELAYS_MS).toEqual([5_000, 20_000, 60_000]);
    expect(DEFAULT_MAX_JOB_ATTEMPTS).toBe(3);
    expect(JOB_HEARTBEAT_INTERVAL_MS).toBe(5_000);
    expect(JOB_LEASE_DURATION_MS).toBe(30_000);
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(2)).toBe(20_000);
    expect(retryDelayMs(3)).toBe(60_000);
    expect(retryDelayMs(9)).toBe(60_000);
  });

  it("retries retryable failures and dead-letters the third failure", () => {
    const now = new Date("2026-07-26T12:00:00.000Z");

    expect(
      failureDisposition({
        failedAttempt: 1,
        retryable: true,
        now,
      }),
    ).toEqual({
      status: "RETRYING",
      availableAt: new Date("2026-07-26T12:00:05.000Z"),
      delayMs: 5_000,
    });
    expect(
      failureDisposition({
        failedAttempt: 3,
        maxAttempts: 3,
        retryable: true,
        now,
      }),
    ).toEqual({
      status: "DEAD_LETTERED",
      availableAt: null,
      delayMs: null,
    });
    expect(
      failureDisposition({
        failedAttempt: 1,
        retryable: false,
        now,
      }),
    ).toMatchObject({ status: "FAILED" });
  });

  it("recognizes only final statuses as terminal", () => {
    expect(isTerminalJobStatus("PENDING")).toBe(false);
    expect(isTerminalJobStatus("RUNNING")).toBe(false);
    expect(isTerminalJobStatus("RETRYING")).toBe(false);
    expect(isTerminalJobStatus("SUCCEEDED")).toBe(true);
    expect(isTerminalJobStatus("FAILED")).toBe(true);
    expect(isTerminalJobStatus("DEAD_LETTERED")).toBe(true);
    expect(isTerminalJobStatus("SUPERSEDED")).toBe(true);
  });

  it("restricts transitions out of terminal states", () => {
    expect(canTransitionJobStatus("PENDING", "RUNNING")).toBe(true);
    expect(canTransitionJobStatus("RUNNING", "RETRYING")).toBe(true);
    expect(canTransitionJobStatus("RUNNING", "SUCCEEDED")).toBe(true);
    expect(canTransitionJobStatus("SUCCEEDED", "RUNNING")).toBe(false);
    expect(canTransitionJobStatus("SUPERSEDED", "RUNNING")).toBe(false);
  });

  it("computes and identifies lease expiry at the boundary", () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    const expiresAt = leaseExpiresAt(now);

    expect(expiresAt).toEqual(new Date("2026-07-26T12:00:30.000Z"));
    expect(
      isExpiredRunningClaim({
        status: "RUNNING",
        leaseExpiresAt: expiresAt,
        now: new Date("2026-07-26T12:00:29.999Z"),
      }),
    ).toBe(false);
    expect(
      isExpiredRunningClaim({
        status: "RUNNING",
        leaseExpiresAt: expiresAt,
        now: new Date("2026-07-26T12:00:30.000Z"),
      }),
    ).toBe(true);
    expect(
      isExpiredRunningClaim({
        status: "RETRYING",
        leaseExpiresAt: expiresAt,
        now: new Date("2026-07-26T12:00:31.000Z"),
      }),
    ).toBe(false);
  });
});
