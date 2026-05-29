import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    user: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

import { updateUserProfile } from "./actions";

describe("profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.user.update.mockResolvedValue({
      id: "user_1",
      name: "Gabriel",
      email: "gabriel@example.com",
      image: null,
    });
  });

  it("updates the authenticated user's editable profile name", async () => {
    await expect(
      updateUserProfile("user_1", { name: "  Gabriel  " }),
    ).resolves.toEqual({
      status: "updated",
      profile: {
        id: "user_1",
        name: "Gabriel",
        email: "gabriel@example.com",
        image: null,
      },
    });

    expect(mocks.db.user.update).toHaveBeenCalledWith({
      where: {
        id: "user_1",
      },
      data: {
        name: "Gabriel",
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });
  });

  it("rejects invalid profile names", async () => {
    await expect(updateUserProfile("user_1", { name: "" })).resolves.toEqual({
      status: "invalid",
    });
    expect(mocks.db.user.update).not.toHaveBeenCalled();
  });
});
