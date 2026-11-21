import { describe, expect, it } from "vitest";

import { readWordings, recordWordings, type WordingRow } from "./wording-store";

type Row = WordingRow & { tripId: string; createdAt: Date };

/** A stand-in for the table: the unique key is trip, subject, facts key and who worded it. */
function fakeClient() {
  const rows: Row[] = [];
  const client = {
    wordingRecord: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Omit<Row, "createdAt">[];
        skipDuplicates: boolean;
      }) => {
        expect(skipDuplicates).toBe(true);
        for (const row of data)
          if (
            !rows.some(
              (r) =>
                r.tripId === row.tripId &&
                r.subject === row.subject &&
                r.factsKey === row.factsKey &&
                r.wordedBy === row.wordedBy,
            )
          )
            rows.push({ ...row, createdAt: new Date(rows.length) });
      },
      findMany: async ({
        where,
      }: {
        where: { tripId: string; subject: { in: string[] } };
      }) =>
        rows
          .filter(
            (r) =>
              r.tripId === where.tripId && where.subject.in.includes(r.subject),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    },
  };
  return { rows, client: client as never };
}

const row = (factsKey: string, shown: string): WordingRow => ({
  subject: "card:s1:p1",
  factsKey,
  sentences: [],
  shown,
  wordedBy: "template",
  fallback: "off",
});

describe("the wording record", () => {
  it("writes nothing for a repeat", async () => {
    const { rows, client } = fakeClient();
    await recordWordings(client, "t1", [row("k1", "A.")]);
    await recordWordings(client, "t1", [row("k1", "A.")]);
    expect(rows).toHaveLength(1);
  });

  it("makes a new row when a fact changes, and keeps the old one", async () => {
    const { client } = fakeClient();
    await recordWordings(client, "t1", [row("k1", "A.")]);
    await recordWordings(client, "t1", [row("k2", "B.")]);
    const read = await readWordings(client, "t1", ["card:s1:p1"]);
    expect(read.map((r) => r.shown)).toEqual(["B.", "A."]);
    expect(await readWordings(client, "t2", ["card:s1:p1"])).toEqual([]);
  });
});
