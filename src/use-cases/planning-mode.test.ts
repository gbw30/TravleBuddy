import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setPlanningMode: vi.fn(),
  readTripSaid: vi.fn(),
  readConversation: vi.fn(),
  appendMessages: vi.fn(),
}));
vi.mock("@/features/trips", () => ({ setPlanningMode: mocks.setPlanningMode }));
vi.mock("@/features/memory", () => ({ readTripSaid: mocks.readTripSaid }));
vi.mock("@/features/conversation", () => ({
  readConversation: mocks.readConversation,
  appendMessages: mocks.appendMessages,
}));

import { changePlanningMode, saidInBrief } from "./planning-mode";

const tx = { name: "tx" } as never;
const change = (mode: "GUIDED" | "QUICK") =>
  changePlanningMode(tx, "user-1", "trip-1", mode);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setPlanningMode.mockImplementation(
    async (_tx, _user, _trip, planningMode) => ({ planningMode }),
  );
  mocks.readTripSaid.mockResolvedValue(null);
  mocks.readConversation.mockResolvedValue([]);
});

describe("changing the way a trip is planned", () => {
  it("changes the mode and nothing else when the brief's box is empty", async () => {
    expect(await change("GUIDED")).toEqual({ planningMode: "GUIDED" });
    expect(mocks.setPlanningMode).toHaveBeenCalledWith(
      tx,
      "user-1",
      "trip-1",
      "GUIDED",
    );
    expect(mocks.appendMessages).not.toHaveBeenCalled();
  });

  it("puts the words of the brief's box into the thread when turning to the conversation", async () => {
    mocks.readTripSaid.mockResolvedValue("Not too many stairs");
    await change("GUIDED");
    expect(mocks.appendMessages).toHaveBeenCalledWith(tx, "trip-1", [
      {
        from: "agent",
        body: {
          kind: "text",
          text: "In your brief you also wrote: “Not too many stairs”.",
        },
      },
    ]);
  });

  it("says them once, however often the traveller goes back and forth", async () => {
    mocks.readTripSaid.mockResolvedValue("Not too many stairs");
    mocks.readConversation.mockResolvedValue([
      { body: { kind: "text", text: saidInBrief("Not too many stairs") } },
    ]);
    await change("GUIDED");
    expect(mocks.appendMessages).not.toHaveBeenCalled();
    // Changed words are said again.
    mocks.readTripSaid.mockResolvedValue("Not too many stairs. Quiet places");
    await change("GUIDED");
    expect(mocks.appendMessages).toHaveBeenCalledTimes(1);
  });

  it("adds nothing to the thread when turning to the brief", async () => {
    mocks.readTripSaid.mockResolvedValue("Not too many stairs");
    expect(await change("QUICK")).toEqual({ planningMode: "QUICK" });
    expect(mocks.readTripSaid).not.toHaveBeenCalled();
    expect(mocks.appendMessages).not.toHaveBeenCalled();
  });

  it("passes on a refusal without touching the thread", async () => {
    mocks.setPlanningMode.mockResolvedValue("archived");
    mocks.readTripSaid.mockResolvedValue("Not too many stairs");
    expect(await change("GUIDED")).toBe("archived");
    expect(mocks.appendMessages).not.toHaveBeenCalled();
  });
});
