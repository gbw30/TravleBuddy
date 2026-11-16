import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  prismaClient: vi.fn(function PrismaClientMock() {
    return {
      $disconnect: mocks.disconnect,
      trip: {
        findFirst: vi.fn(),
      },
    };
  }),
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn(function PrismaPgMock() {
    return {};
  }),
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: mocks.prismaClient,
}));

vi.mock("@/lib/env", () => ({
  getDatabaseEnv: () => ({
    DATABASE_URL: "postgresql://example.invalid/database",
  }),
}));

describe("database client initialization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not validate runtime environment while importing the db module", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();

    await expect(import("./db")).resolves.toHaveProperty("db");
  });

  it("reuses one lazy client in production and disconnects it once", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const { disconnectDb, getDb } = await import("./db");

    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(mocks.prismaClient).toHaveBeenCalledOnce();

    await disconnectDb();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
});
