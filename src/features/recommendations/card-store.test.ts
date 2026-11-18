import { describe, expect, it } from "vitest";

import {
  readDiscards,
  recordCard,
  recordDiscards,
  recordPresented,
} from "./card-store";

type Row = {
  tripId: string;
  slotId: string;
  placeId: string;
  action: string;
  reason?: string | null;
  note?: string | null;
};

/** A stand-in for the card_events table. */
function fakeClient() {
  const rows: Row[] = [];
  const client = {
    cardEvent: {
      findMany: async ({
        where,
      }: {
        where: {
          tripId: string;
          action?: string;
          slotId?: string;
          placeId?: { in: string[] };
        };
      }) =>
        rows.filter(
          (row) =>
            row.tripId === where.tripId &&
            (!where.action || row.action === where.action) &&
            (!where.slotId || row.slotId === where.slotId) &&
            (!where.placeId || where.placeId.in.includes(row.placeId)),
        ),
      createMany: async ({ data }: { data: Row[] }) => void rows.push(...data),
      create: async ({ data }: { data: Row }) => void rows.push(data),
    },
  };
  return { client: client as never, rows };
}

describe("the record of cards", () => {
  it("records each card shown for a slot once", async () => {
    const { client, rows } = fakeClient();
    await recordPresented(client, "trip-1", "d2-morning", ["a", "b", "c"]);
    await recordPresented(client, "trip-1", "d2-morning", ["b", "c", "d"]);
    await recordPresented(client, "trip-1", "d2-morning", []);

    expect(rows.map((row) => row.placeId)).toEqual(["a", "b", "c", "d"]);
    expect(rows.every((row) => row.action === "PRESENTED")).toBe(true);
  });

  it("records a card shown again for another slot", async () => {
    const { client, rows } = fakeClient();
    await recordPresented(client, "trip-1", "d2-morning", ["a"]);
    await recordPresented(client, "trip-1", "d3-morning", ["a"]);
    expect(rows).toHaveLength(2);
  });

  it("records a pick and a save", async () => {
    const { client, rows } = fakeClient();
    await recordCard(client, "trip-1", "d2-morning", "a", "PICKED");
    await recordCard(client, "trip-1", "shelf", "b", "SAVED");
    expect(rows.map((row) => [row.action, row.placeId, row.slotId])).toEqual([
      ["PICKED", "a", "d2-morning"],
      ["SAVED", "b", "shelf"],
    ]);
  });

  it("records a discard for each place and reason, or one with no reason", async () => {
    const { client, rows } = fakeClient();
    await recordDiscards(
      client,
      "trip-1",
      "d2-morning",
      ["a", "b"],
      ["too_far", "too_busy"],
      "Tired legs",
    );
    await recordDiscards(client, "trip-1", "d2-morning", ["c"], [], null);

    expect(rows.map((row) => [row.placeId, row.reason, row.note])).toEqual([
      ["a", "too_far", "Tired legs"],
      ["a", "too_busy", "Tired legs"],
      ["b", "too_far", "Tired legs"],
      ["b", "too_busy", "Tired legs"],
      ["c", null, null],
    ]);
    expect(await readDiscards(client, "trip-1")).toHaveLength(5);
    expect(await readDiscards(client, "trip-2")).toEqual([]);
  });
});
