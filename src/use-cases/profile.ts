import { QUESTIONS } from "@/features/conversation";
import type { Prisma } from "@/generated/prisma/client";
import {
  addNote,
  deleteEntry,
  deleteNote,
  readProfile,
  resetProfile,
  saveStated,
  type SavedEntry,
} from "@/features/memory";
import {
  fileUnder,
  kindOf,
  MULTI_TOPICS,
  PROFILE_TOPICS,
  TASTE_TOPICS,
  TOPIC_NAMES,
  type ProfileTopicInfo,
  type TasteTopic,
} from "@/features/memory/contracts";
import { db } from "@/lib/db";

import { tripsThatShowed } from "./learning";
import type { FiledAs, ProfileView, ShownEntry } from "./profile-view";

// The profile page spans two services: Memory holds the profile, and the
// Conversation service's script says which values each topic can hold and
// the words for them. Every call names the signed-in traveller, and the
// stores answer only for that traveller.

/** What each topic can hold. */
export function profileTopics(): ProfileTopicInfo[] {
  return PROFILE_TOPICS.map((topic) => {
    const taste = (TASTE_TOPICS as readonly string[]).includes(topic);
    return {
      topic,
      name: TOPIC_NAMES[topic],
      kind: kindOf(topic),
      several: MULTI_TOPICS.includes(topic),
      choices:
        topic === "dietary_rules"
          ? // Until the food question is split in two, its choices are the dietary rules.
            QUESTIONS.food.choices.filter((choice) => choice.value !== "none")
          : taste && topic !== "food"
            ? QUESTIONS[topic as TasteTopic].choices
            : [],
      freeText: topic === "allergies" || topic === "budget",
    };
  });
}

const shown = (entry: SavedEntry, topics: ProfileTopicInfo[]): ShownEntry => ({
  ...entry,
  label:
    topics
      .find((info) => info.topic === entry.topic)
      ?.choices.find((choice) => choice.value === entry.value)?.label ??
    entry.value,
});

/** The traveller's profile as the page shows it. */
export async function loadProfile(userId: string): Promise<ProfileView> {
  const topics = profileTopics();
  const profile = await readProfile(db, userId);
  return {
    revision: profile.revision,
    entries: profile.entries.map((entry) => shown(entry, topics)),
    notes: profile.notes,
    topics,
  };
}

/**
 * Something the traveller says about themselves. It becomes an entry when it
 * plainly is one of a topic's values or an allergy; otherwise it is kept as
 * a note that does not yet affect suggestions (TB-MEM-14).
 */
export function tellProfile(
  userId: string,
  text: string,
  hard: boolean,
): Promise<FiledAs> {
  return db.$transaction((tx) => tellProfileIn(tx, userId, text, hard));
}

/** `tellProfile` inside a change that is already under way, such as a turn of the conversation. */
export async function tellProfileIn(
  tx: Prisma.TransactionClient,
  userId: string,
  text: string,
  hard: boolean,
): Promise<FiledAs> {
  const topics = profileTopics();
  const filed = fileUnder(text, hard, topics);
  if (filed.type === "entry") {
    return {
      type: "entry",
      entry: shown(
        await saveStated(tx, userId, filed.topic, filed.value),
        topics,
      ),
    };
  }
  // Saying the same thing twice keeps one note.
  const { notes } = await readProfile(tx, userId);
  const same = notes.find((note) => note.text === filed.text);
  return {
    type: "note",
    note: same ?? (await addNote(tx, userId, filed.text)),
  };
}

/**
 * Changes an entry's value, or confirms it when the value is the same.
 * Either way the entry becomes something the traveller stated. "invalid"
 * means the topic cannot hold that value.
 */
export async function changeEntry(
  userId: string,
  id: string,
  value: string,
): Promise<"not_found" | "invalid" | ShownEntry> {
  const topics = profileTopics();
  const evidence = await evidenceBehind(userId, id);
  return db.$transaction(async (tx) => {
    const { entries } = await readProfile(tx, userId);
    const entry = entries.find((item) => item.id === id);
    if (!entry) return "not_found";
    const info = topics.find((item) => item.topic === entry.topic);
    const wanted = value.trim();
    const allowed = info?.freeText
      ? wanted.length > 0 && wanted.length <= 80
      : info?.choices.some((choice) => choice.value === wanted);
    if (!allowed) return "invalid";
    // The old value goes first. If it was learned, its trips are forgotten
    // for it, so it is not learned back (TB-MEM-12).
    if (wanted !== entry.value) await deleteEntry(tx, userId, id, evidence);
    return shown(await saveStated(tx, userId, entry.topic, wanted), topics);
  });
}

export async function removeEntry(userId: string, id: string) {
  const evidence = await evidenceBehind(userId, id);
  return db.$transaction((tx) => deleteEntry(tx, userId, id, evidence));
}

/**
 * Every finished trip that showed a learned entry's value. Deleting the
 * entry forgets all of them, so it is not learned again from the same past
 * (TB-MEM-12). Empty for an entry the traveller stated, or not theirs.
 */
async function evidenceBehind(userId: string, id: string): Promise<string[]> {
  const { entries } = await readProfile(db, userId);
  const entry = entries.find((item) => item.id === id);
  return entry?.source.type === "trip"
    ? tripsThatShowed(userId, entry.topic, entry.value)
    : [];
}

export function removeNote(userId: string, id: string) {
  return db.$transaction((tx) => deleteNote(tx, userId, id));
}

/** Forgets everything the site believes about the traveller. */
export function forgetEverything(userId: string) {
  return db.$transaction((tx) => resetProfile(tx, userId));
}
