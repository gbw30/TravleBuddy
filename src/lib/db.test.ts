import { afterEach, describe, expect, it, vi } from "vitest";

describe("database client initialization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not validate runtime environment while importing the db module", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();

    await expect(import("./db")).resolves.toHaveProperty("db");
  });
});
