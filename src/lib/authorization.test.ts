import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

import { getCurrentUserId, requireUser } from "./authorization";

describe("authorization session user resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session user id only when the user still exists in the database", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "user_1",
      },
    });
    mocks.db.user.findUnique.mockResolvedValue({
      id: "user_1",
    });

    await expect(getCurrentUserId()).resolves.toBe("user_1");
    expect(mocks.db.user.findUnique).toHaveBeenCalledWith({
      where: {
        id: "user_1",
      },
      select: {
        id: true,
      },
    });
  });

  it("treats stale JWT sessions as signed out when the user row is missing", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "stale_user",
      },
    });
    mocks.db.user.findUnique.mockResolvedValue(null);

    await expect(getCurrentUserId()).resolves.toBeNull();
    await expect(requireUser()).rejects.toThrow("redirect:/login");
  });
});
