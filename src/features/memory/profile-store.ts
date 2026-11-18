import type { Prisma } from "@/generated/prisma/client";

import {
  MULTI_TOPICS,
  PROFILE_TOPICS,
  profileEntrySchema,
  type ProfileEntry,
  type ProfileNote,
  type ProfileTopic,
} from "./contracts";
import type { Forgotten } from "./profile-rules";

type Client = Prisma.TransactionClient;
type Row = Prisma.ProfileEntryGetPayload<object>;

// The personal profile of one traveller (TB-MEM-01). Every query names the
// traveller's id, so one traveller can never read or change another's
// profile. Every change raises the profile's revision and appends to its
// history (TB-MEM-13). Callers run a change inside a transaction.

export type SavedEntry = ProfileEntry & { id: string };
export type SavedNote = ProfileNote & { id: string };
export type Profile = {
  revision: number;
  /** Trips finished before this moment teach nothing: set by a reset. */
  learnAfter: string | null;
  entries: SavedEntry[];
  notes: SavedNote[];
};
/** Who caused a change. */
export type Cause = "traveller" | "learning" | "reset";

/** A saved row as an entry; null when it no longer fits the schema. */
function toEntry(row: Row): SavedEntry | null {
  const entry = profileEntrySchema.safeParse({
    topic: row.topic,
    value: row.value,
    sureness: row.sureness,
    source: row.sourceTripId
      ? {
          type: "trip",
          tripId: row.sourceTripId,
          tripTitle: row.sourceTripTitle ?? "an earlier trip",
        }
      : { type: "told" },
  });
  return entry.success ? { id: row.id, ...entry.data } : null;
}

const columns = (entry: ProfileEntry) => ({
  topic: entry.topic,
  value: entry.value,
  sureness: entry.sureness,
  sourceTripId: entry.source.type === "trip" ? entry.source.tripId : null,
  sourceTripTitle: entry.source.type === "trip" ? entry.source.tripTitle : null,
});
/** What the history keeps of an entry. */
const snapshot = (row: Row) => ({
  value: row.value,
  sureness: row.sureness,
  sourceTripId: row.sourceTripId,
  sourceTripTitle: row.sourceTripTitle,
});

/** Counts a change: the revision goes up by one. The profile is created on first use. */
async function nextRevision(client: Client, userId: string): Promise<number> {
  const profile = await client.profile.upsert({
    where: { userId },
    create: { userId, revision: 1 },
    update: { revision: { increment: 1 } },
    select: { revision: true },
  });
  return profile.revision;
}

/** The traveller's profile. Empty for a traveller who has none yet. */
export async function readProfile(
  client: Client,
  userId: string,
): Promise<Profile> {
  const [profile, rows, notes] = await Promise.all([
    client.profile.findUnique({
      where: { userId },
      select: { revision: true, learnAfter: true },
    }),
    client.profileEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    client.profileNote.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, text: true },
    }),
  ]);
  const entries = rows.flatMap((row) => toEntry(row) ?? []);
  return {
    revision: profile?.revision ?? 0,
    learnAfter: profile?.learnAfter?.toISOString() ?? null,
    // Grouped by topic in the profile's own order.
    entries: PROFILE_TOPICS.flatMap((topic) =>
      entries.filter((entry) => entry.topic === topic),
    ),
    notes,
  };
}

/**
 * Saves something the traveller stated. It is held as "always", and on a
 * topic that holds one value it replaces whatever was there, learned or not.
 */
export async function saveStated(
  client: Client,
  userId: string,
  topic: ProfileTopic,
  value: string,
): Promise<SavedEntry> {
  const entry = profileEntrySchema.parse({
    topic,
    value,
    sureness: "always",
    source: { type: "told" },
  });
  const revision = await nextRevision(client, userId);
  const existing = await client.profileEntry.findMany({
    where: { userId, topic },
  });
  const before = existing.find((row) => row.value === entry.value);
  const replaced = MULTI_TOPICS.includes(topic)
    ? []
    : existing.filter((row) => row.value !== entry.value);
  if (replaced.length > 0) {
    await client.profileEntry.deleteMany({
      where: { userId, id: { in: replaced.map((row) => row.id) } },
    });
  }
  const saved = await client.profileEntry.upsert({
    where: { userId_topic_value: { userId, topic, value: entry.value } },
    create: { userId, ...columns(entry) },
    update: columns(entry),
  });
  await client.profileHistory.createMany({
    data: [
      ...replaced.map((row) => ({
        userId,
        revision,
        topic,
        before: snapshot(row),
        cause: "traveller",
      })),
      {
        userId,
        revision,
        topic,
        ...(before ? { before: snapshot(before) } : {}),
        after: snapshot(saved),
        cause: "traveller",
      },
    ],
  });
  return { id: saved.id, ...entry };
}

/**
 * Deletes one entry of the traveller's. A learned entry is also forgotten:
 * the trips it came from no longer count for that value (TB-MEM-12).
 * `evidenceTripIds` are every trip that showed the value; the entry itself
 * names only the most recent.
 */
export async function deleteEntry(
  client: Client,
  userId: string,
  id: string,
  evidenceTripIds: string[] = [],
  cause: Cause = "traveller",
): Promise<"not_found" | { deleted: true }> {
  const row = await client.profileEntry.findFirst({ where: { id, userId } });
  if (!row) return "not_found";
  const revision = await nextRevision(client, userId);
  await client.profileEntry.deleteMany({ where: { id, userId } });
  await client.profileHistory.create({
    data: {
      userId,
      revision,
      topic: row.topic,
      before: snapshot(row),
      cause,
    },
  });
  if (row.sourceTripId) {
    const where = {
      userId_topic_value: { userId, topic: row.topic, value: row.value },
    };
    const known = await client.forgottenEvidence.findUnique({
      where,
      select: { tripIds: true },
    });
    const tripIds = [
      ...new Set([
        ...(known?.tripIds ?? []),
        row.sourceTripId,
        ...evidenceTripIds,
      ]),
    ];
    await client.forgottenEvidence.upsert({
      where,
      create: { userId, topic: row.topic, value: row.value, tripIds },
      update: { tripIds },
    });
  }
  return { deleted: true };
}

/**
 * Makes the learned entries exactly `learned`, the set the rules worked out
 * from finished trips. Entries the traveller stated are never touched
 * (TB-MEM-10). Answers whether anything changed.
 */
export async function replaceLearned(
  client: Client,
  userId: string,
  learned: ProfileEntry[],
): Promise<boolean> {
  const rows = await client.profileEntry.findMany({ where: { userId } });
  const stated = rows.filter((row) => row.sourceTripId === null);
  const current = rows.filter((row) => row.sourceTripId !== null);
  const key = (item: { topic: string; value: string }) =>
    `${item.topic}\n${item.value}`;
  // A value the traveller stated is theirs, whatever the trips showed.
  const wanted = learned.filter(
    (entry) =>
      entry.source.type === "trip" &&
      !stated.some((row) => key(row) === key(entry)),
  );

  const gone = current.filter(
    (row) => !wanted.some((entry) => key(entry) === key(row)),
  );
  const changed = wanted.filter((entry) => {
    const row = current.find((item) => key(item) === key(entry));
    const next = columns(entry);
    return (
      !row ||
      row.sureness !== next.sureness ||
      row.sourceTripId !== next.sourceTripId ||
      row.sourceTripTitle !== next.sourceTripTitle
    );
  });
  if (gone.length === 0 && changed.length === 0) return false;

  const revision = await nextRevision(client, userId);
  if (gone.length > 0) {
    await client.profileEntry.deleteMany({
      where: { userId, id: { in: gone.map((row) => row.id) } },
    });
  }
  const history: Prisma.ProfileHistoryCreateManyInput[] = gone.map((row) => ({
    userId,
    revision,
    topic: row.topic,
    before: snapshot(row),
    cause: "learning",
  }));
  for (const entry of changed) {
    const before = current.find((row) => key(row) === key(entry));
    const saved = await client.profileEntry.upsert({
      where: {
        userId_topic_value: { userId, topic: entry.topic, value: entry.value },
      },
      create: { userId, ...columns(entry) },
      update: columns(entry),
    });
    history.push({
      userId,
      revision,
      topic: entry.topic,
      ...(before ? { before: snapshot(before) } : {}),
      after: snapshot(saved),
      cause: "learning",
    });
  }
  await client.profileHistory.createMany({ data: history });
  return true;
}

/**
 * Forgets everything: entries, notes, and what was deleted before. Trips
 * finished up to now teach nothing afterwards, so a reset profile is not
 * learned back from the same past (TB-MEM-11, TB-MEM-12).
 */
export async function resetProfile(
  client: Client,
  userId: string,
  now = new Date(),
): Promise<void> {
  const rows = await client.profileEntry.findMany({ where: { userId } });
  const revision = await nextRevision(client, userId);
  await client.profile.update({
    where: { userId },
    data: { learnAfter: now },
  });
  await client.profileEntry.deleteMany({ where: { userId } });
  await client.profileNote.deleteMany({ where: { userId } });
  await client.forgottenEvidence.deleteMany({ where: { userId } });
  await client.profileHistory.createMany({
    data:
      rows.length > 0
        ? rows.map((row) => ({
            userId,
            revision,
            topic: row.topic,
            before: snapshot(row),
            cause: "reset",
          }))
        : [{ userId, revision, topic: "profile", cause: "reset" }],
  });
}

/** Keeps something that fits no topic (TB-MEM-14). */
export async function addNote(
  client: Client,
  userId: string,
  text: string,
): Promise<SavedNote> {
  const revision = await nextRevision(client, userId);
  const note = await client.profileNote.create({
    data: { userId, text },
    select: { id: true, text: true },
  });
  await client.profileHistory.create({
    data: {
      userId,
      revision,
      topic: "note",
      after: { text: note.text },
      cause: "traveller",
    },
  });
  return note;
}

export async function deleteNote(
  client: Client,
  userId: string,
  id: string,
): Promise<"not_found" | { deleted: true }> {
  const note = await client.profileNote.findFirst({ where: { id, userId } });
  if (!note) return "not_found";
  const revision = await nextRevision(client, userId);
  await client.profileNote.deleteMany({ where: { id, userId } });
  await client.profileHistory.create({
    data: {
      userId,
      revision,
      topic: "note",
      before: { text: note.text },
      cause: "traveller",
    },
  });
  return { deleted: true };
}

/** The learned entries the traveller deleted, for the learning rules. */
export async function readForgotten(
  client: Client,
  userId: string,
): Promise<Forgotten[]> {
  const rows = await client.forgottenEvidence.findMany({
    where: { userId },
    select: { topic: true, value: true, tripIds: true },
  });
  return rows.flatMap((row) =>
    (PROFILE_TOPICS as readonly string[]).includes(row.topic)
      ? [
          {
            topic: row.topic as ProfileTopic,
            value: row.value,
            tripIds: row.tripIds,
          },
        ]
      : [],
  );
}

export type HistoryLine = {
  revision: number | null;
  topic: string;
  before: unknown;
  after: unknown;
  cause: string;
  at: string;
};

/** The latest changes to the traveller's profile, newest first. */
export async function readProfileHistory(
  client: Client,
  userId: string,
  take = 100,
): Promise<HistoryLine[]> {
  const rows = await client.profileHistory.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    take,
  });
  return rows.map((row) => ({
    revision: row.revision,
    topic: row.topic,
    before: row.before,
    after: row.after,
    cause: row.cause,
    at: row.createdAt.toISOString(),
  }));
}
