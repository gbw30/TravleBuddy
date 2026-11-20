import { describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";

import { saveTripFacts } from "./trip-store";

type Stored = { startDate: Date | null; endDate: Date | null };
type Clause = { startDate?: unknown; endDate?: unknown };

// A one-row stand-in for the trips table that applies the update's own
// conditions, so a refused save leaves the row as it was.
function fakeTx(stored: Stored) {
  const holds = (value: Date | null, test: unknown) =>
    test === null
      ? value === null
      : value !== null &&
        ((test as { lte?: Date }).lte
          ? value <= (test as { lte: Date }).lte
          : value >= (test as { gte: Date }).gte);
  const tx = {
    trip: {
      findFirst: async () => ({ status: "PLANNING" }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { OR?: Clause[] };
        data: Partial<Stored>;
      }) => {
        const met =
          !where.OR ||
          where.OR.some((clause) =>
            Object.entries(clause).every(([key, test]) =>
              holds(stored[key as keyof Stored], test),
            ),
          );
        if (!met) return { count: 0 };
        Object.assign(stored, data);
        return { count: 1 };
      },
    },
  };
  return tx as unknown as Prisma.TransactionClient;
}
const stored = () => ({
  startDate: new Date("2027-05-10T00:00:00Z"),
  endDate: new Date("2027-05-14T00:00:00Z"),
});

describe("saving one date alone", () => {
  it("refuses an end before the stored start", async () => {
    const row = stored();
    expect(
      await saveTripFacts(fakeTx(row), "u", "t", { endDate: "2027-05-01" }),
    ).toBe("bad_dates");
    expect(row).toEqual(stored());
  });

  it("refuses a start after the stored end", async () => {
    const row = stored();
    expect(
      await saveTripFacts(fakeTx(row), "u", "t", { startDate: "2027-06-01" }),
    ).toBe("bad_dates");
    expect(row).toEqual(stored());
  });

  it("saves a lone date that fits, or one with no stored date to meet", async () => {
    const row = stored();
    expect(
      await saveTripFacts(fakeTx(row), "u", "t", { endDate: "2027-05-20" }),
    ).toEqual({ saved: true });
    expect(row.endDate).toEqual(new Date("2027-05-20T00:00:00Z"));

    const open = { startDate: null, endDate: null };
    expect(
      await saveTripFacts(fakeTx(open), "u", "t", { endDate: "2027-05-01" }),
    ).toEqual({ saved: true });
  });
});
