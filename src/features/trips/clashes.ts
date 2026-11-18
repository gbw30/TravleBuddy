import type { Clash, CommitmentDto } from "./contracts";

type Timed = Pick<
  CommitmentDto,
  "id" | "kind" | "date" | "startTime" | "endDate" | "endTime"
>;

/** The period a commitment takes up, as sortable `YYYY-MM-DDTHH:MM` text. */
function period(commitment: Timed): [string, string] | null {
  // A stay runs alongside everything else during it, so it never clashes.
  if (commitment.kind === "STAY") return null;
  if (!commitment.date || !commitment.startTime) return null;

  const start = `${commitment.date}T${commitment.startTime}`;
  const end = commitment.endTime
    ? `${commitment.endDate ?? commitment.date}T${commitment.endTime}`
    : start;
  // An arrival that reads earlier than its departure crossed time zones; all
  // that is certain is the moment it leaves.
  return [start, end < start ? start : end];
}

/**
 * Pairs of commitments whose times overlap (TB-FIX-06). Two that only touch,
 * one ending as the next begins, do not clash.
 */
export function findClashes(commitments: Timed[]): Clash[] {
  const timed = commitments.flatMap((commitment) => {
    const range = period(commitment);
    return range ? [{ id: commitment.id, start: range[0], end: range[1] }] : [];
  });

  const clashes: Clash[] = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      const overlap =
        a.start === b.start || (a.start < b.end && b.start < a.end);
      if (overlap) clashes.push({ first: a.id, second: b.id });
    }
  }
  return clashes;
}
