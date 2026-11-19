"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type FormEvent } from "react";

import {
  dailyBudgetOf,
  fileUnder,
  sourceWords,
  TOPIC_NAMES,
  type ProfileTopic,
} from "@/features/memory/contracts";
import type { Rates } from "@/lib/currency";
import { callApi } from "@/lib/trip-api";
import type {
  FiledAs,
  ProfileView,
  ShapedView,
  ShownEntry,
} from "@/use-cases/profile-view";

import { Stamp } from "./day-stamp";
import { NoteChip } from "./note-chip";
import { BudgetCard } from "./profile-budget";
import {
  card,
  guessCard,
  Icon,
  ProfilePrinciples,
  rise,
  SectionHead,
  Sure,
} from "./profile-parts";
import {
  button,
  buttonArrow,
  buttonLarge,
  buttonSecond,
  chip,
  eyebrow,
  fieldLarge,
  lift,
  pageTitle,
  quiet,
  sectionTitle,
} from "./styles";

const icons: Partial<Record<ProfileTopic, string>> = {
  interests: "interests",
  getting_around: "getting around",
  atmosphere: "atmosphere",
  stay: "stay",
  food: "food",
};

/**
 * Habits: topics that are a point on a scale, set by a slider. `stops` is
 * the scale from left to right, `unset` where the site stands when the
 * traveller has said nothing, and `does` what each stop changes in a plan.
 */
const HABITS: {
  topic: ProfileTopic;
  stops: string[];
  unset: string;
  says: Record<string, string>;
  does: Record<string, string>;
}[] = [
  {
    topic: "pace",
    stops: ["relaxed", "balanced", "packed"],
    unset: "balanced",
    says: {
      relaxed: "A relaxed pace",
      balanced: "A balanced pace",
      packed: "Full days",
    },
    does: {
      relaxed: "Up to two main sights a day, with two hours to wander.",
      balanced: "Up to three main sights a day, with an hour to wander.",
      packed: "Up to four main sights a day.",
    },
  },
  {
    topic: "day_shape",
    stops: ["early", "neither", "late"],
    unset: "neither",
    says: {
      early: "Early starts",
      neither: "The usual hours",
      late: "Late nights",
    },
    does: {
      early: "The whole day runs an hour earlier, dinner included.",
      neither: "Mornings begin between nine and ten.",
      late: "The whole day runs an hour later, dinner included.",
    },
  },
];
const HABIT_TOPICS = HABITS.map((habit) => habit.topic);
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** The picture of the traveller in one sentence, from the entries themselves. */
export function profileSentence(entries: ShownEntry[]): string[] {
  const of = (topic: ProfileTopic) =>
    entries.find((entry) => entry.topic === topic);
  const pace = {
    relaxed: "slowly",
    balanced: "at an even pace",
    packed: "with full days",
  }[of("pace")?.value ?? ""];
  const start = { early: "start early", late: "stay out late" }[
    of("day_shape")?.value ?? ""
  ];
  const allergy = of("allergies");
  const rule = of("dietary_rules");
  return [
    pace ? `You travel ${pace}` : null,
    start ?? null,
    allergy
      ? `never eat ${allergy.value}`
      : rule
        ? `eat ${lower(rule.label)}`
        : null,
  ].filter((part): part is string => part !== null);
}

/**
 * The profile page (PRD 12.5): everything the site believes about the
 * traveller, with where each thing came from and how sure it is, and the
 * means to correct, remove, add and forget. The server holds the profile;
 * every action goes to it and the profile it answers is shown.
 */
export function ProfileBook({
  initial,
  name,
  rates = null,
  shaped = null,
}: {
  initial: ProfileView;
  /** The traveller's name, for the passport's initial. */
  name: string | null;
  /** The day's exchange rates for the daily budget; null when they cannot be had. */
  rates?: Rates | null;
  /** What the profile did to the traveller's latest trip, when there is one to show. */
  shaped?: ShapedView | null;
}) {
  const [profile, setProfile] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [hard, setHard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const forget = useRef<HTMLDialogElement>(null);

  const { entries, notes, topics } = profile;
  const kind = (entry: ShownEntry) =>
    topics.find((info) => info.topic === entry.topic)?.kind ?? "taste";
  const rules = entries.filter((entry) => kind(entry) === "hard_limit");
  // A daily budget that reads as an amount has its own card. Older free
  // words under "budget" stay in the list below.
  const budget = entries.find(
    (entry) => entry.topic === "budget" && dailyBudgetOf(entry.value),
  );
  // A habit has its own card with a slider; the rest of the tastes are listed.
  const tastes = entries.filter(
    (entry) =>
      kind(entry) === "taste" &&
      !HABIT_TOPICS.includes(entry.topic) &&
      entry !== budget,
  );
  // Where a slider stands while it is moved, before it is saved.
  const [moved, setMoved] = useState<Partial<Record<ProfileTopic, string>>>({});
  const trips = [
    ...new Map(
      entries.flatMap((entry) =>
        entry.source.type === "trip"
          ? [[entry.source.tripId, entry.source.tripTitle] as const]
          : [],
      ),
    ),
  ];
  const sentence = profileSentence(entries);
  const filing = draft.trim() ? fileUnder(draft, hard, topics) : null;

  /** Sends one change and shows the profile it answers. */
  async function send<T extends { profile: ProfileView }>(
    path: string,
    init: { method: "POST" | "PUT" | "PATCH" | "DELETE"; body?: object },
  ): Promise<T | null> {
    setBusy(true);
    setProblem(null);
    setSaid(null);
    const result = await callApi<T>(`/api/v1/profile${path}`, init);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      return null;
    }
    setProfile(result.data.profile);
    return result.data;
  }

  async function tell(text: string, asRule: boolean) {
    const answer = await send<{ filed: FiledAs; profile: ProfileView }>(
      "/entries",
      { method: "POST", body: { text, hard: asRule } },
    );
    if (!answer) return false;
    setSaid(
      answer.filed.type === "entry"
        ? `Remembered under ${TOPIC_NAMES[answer.filed.entry.topic]}: ${answer.filed.entry.label}.`
        : "Noted. It does not affect suggestions yet.",
    );
    return true;
  }

  async function change(entry: ShownEntry, value: string) {
    const answer = await send(`/entries/${entry.id}`, {
      method: "PATCH",
      body: { value },
    });
    if (answer) setEditing(null);
  }

  const remove = (entry: ShownEntry) =>
    send(`/entries/${entry.id}`, { method: "DELETE" });

  const actions = (entry: ShownEntry) => (
    <span className="ml-auto flex gap-4">
      <button
        type="button"
        className={quiet}
        disabled={busy}
        aria-label={`Change ${entry.label}`}
        onClick={() => setEditing(entry.id)}
      >
        Change
      </button>
      <button
        type="button"
        className={quiet}
        disabled={busy}
        aria-label={`Remove ${entry.label}`}
        onClick={() => void remove(entry)}
      >
        Remove
      </button>
    </span>
  );

  const editForm = (entry: ShownEntry) => {
    const info = topics.find((item) => item.topic === entry.topic);
    return (
      <form
        className="flex min-w-0 flex-wrap gap-2"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const value = String(
            new FormData(event.currentTarget).get("value") ?? "",
          ).trim();
          if (value) void change(entry, value);
        }}
      >
        {info?.freeText ? (
          <input
            name="value"
            defaultValue={entry.value}
            maxLength={80}
            aria-label={`Change ${entry.label}`}
            autoFocus
            className={`${fieldLarge} min-w-0 flex-1`}
          />
        ) : (
          <select
            name="value"
            defaultValue={entry.value}
            aria-label={`Change ${entry.label}`}
            autoFocus
            className={`${fieldLarge} min-w-0 flex-1 cursor-pointer`}
          >
            {info?.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className={button} disabled={busy}>
          Save
        </button>
        <button
          type="button"
          className={buttonSecond}
          onClick={() => setEditing(null)}
        >
          Cancel
        </button>
      </form>
    );
  };

  return (
    <div data-qa="profile-book" className="py-10 md:py-14">
      <section className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_350px] lg:gap-[72px]">
        <div>
          <NoteChip label="What I remember" style={rise(0)}>
            {trips.length > 0
              ? `Learned from ${trips.length} ${trips.length === 1 ? "trip" : "trips"}`
              : "Nothing learned from trips yet"}
          </NoteChip>
          <h1 className={`rise mt-6 ${pageTitle}`} style={rise(1)}>
            {sentence.length > 0 ? (
              <>
                <em>{sentence[0]}</em>
                {sentence.length > 1 &&
                  `, ${sentence
                    .slice(1, -1)
                    .map((part) => `${part}, `)
                    .join("")}and ${sentence.at(-1)}`}
                .
              </>
            ) : (
              <>
                I am still <em>getting to know</em> you.
              </>
            )}
          </h1>
          <p
            className="rise mt-6 max-w-[34rem] text-lg text-ink/75"
            style={rise(2)}
          >
            This is my picture of you so far. I use it to make better first
            suggestions, and you can correct any of it.
          </p>
        </div>
        <div className={`rise overflow-hidden ${card}`} style={rise(3)}>
          <div className="flex items-center gap-3.5 border-b border-dashed border-ink/15 px-6 py-5">
            <span
              aria-hidden
              className="grid size-[54px] shrink-0 place-items-center rounded-full bg-ink font-serif text-[28px] leading-none text-paper"
            >
              {(name?.trim()[0] ?? "T").toUpperCase()}
            </span>
            <p>
              <span className="block font-serif text-[25px] leading-tight">
                Your travel passport
              </span>
              <span className="text-[13px] text-muted">
                Yours to correct, any time
              </span>
            </p>
          </div>
          <p className={`${eyebrow} px-6 pt-5`}>Learned from</p>
          <div className="flex flex-wrap gap-x-1 gap-y-4 px-4 pt-4 pb-5">
            {trips.length > 0 ? (
              trips.map(([id, title]) => (
                <Stamp
                  key={id}
                  label={title.toUpperCase().slice(0, 24)}
                  spoken={title}
                />
              ))
            ) : (
              <p className="px-2 text-[13.5px] text-muted">
                Only what you have told me so far.
              </p>
            )}
          </div>
          <dl className="grid grid-cols-2 border-t border-ink/12">
            {[
              [rules.length, "rules I never break"],
              [tastes.length, "things you usually like"],
            ].map(([count, label], index) => (
              <div
                key={label}
                className={`px-6 pt-4 pb-[18px] ${index ? "border-l border-ink/12" : ""}`}
              >
                <dd className="font-serif text-[40px] leading-none">{count}</dd>
                <dt className="mt-1 text-[12.5px] text-muted">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <ProfilePrinciples />

      {entries.length === 0 && notes.length === 0 && (
        <p className="mt-14 font-serif text-2xl italic">
          Nothing yet. I will start fresh on your next trip.
        </p>
      )}

      {rules.length > 0 && (
        <section aria-labelledby="rules-heading" className="mt-[76px]">
          <SectionHead
            id="rules-heading"
            label={`${rules.length} ${rules.length === 1 ? "rule" : "rules"} · apply to every trip`}
            note="I will not suggest a place whose listing breaks one of these. Where the listing does not say, the card tells you to check."
          >
            Rules I <em>never</em> break
          </SectionHead>
          <ul className="grid gap-[18px] md:grid-cols-2">
            {rules.map((entry) => {
              const allergy = entry.topic === "allergies";
              return (
                <li
                  key={entry.id}
                  className="relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-[18px] rounded-2xl bg-card px-6 py-6 shadow-[0_0_0_1.5px_rgb(138_36_32/0.35),var(--shadow-sheet)]"
                >
                  <Icon
                    name={allergy ? "never" : "food"}
                    className="size-[52px] bg-stamp/10 text-stamp"
                  />
                  <div className="min-w-0">
                    {editing === entry.id ? (
                      editForm(entry)
                    ) : (
                      <>
                        <p className={eyebrow}>{TOPIC_NAMES[entry.topic]}</p>
                        <h3 className="mt-1.5 pr-20 text-[31px] leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]">
                          {allergy ? `No ${entry.label}` : entry.label}
                        </h3>
                        <p className="mt-2 text-[14.5px] text-ink/75">
                          {allergy
                            ? "I never call a place safe for an allergy. Every meal card tells you to check with the venue."
                            : "Every meal card names this rule, and says when a place’s listing cannot confirm it."}
                        </p>
                        <p className="mt-4 flex flex-wrap items-center gap-x-4 text-[13px] text-muted">
                          <span className="first-letter:uppercase">
                            {sourceWords(entry.source)}
                          </span>
                          {actions(entry)}
                        </p>
                      </>
                    )}
                  </div>
                  <span className="absolute top-5 right-4">
                    <Stamp
                      label={allergy ? "NEVER" : "ALWAYS"}
                      spoken="A rule I never break"
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section
        data-qa="profile-habits"
        aria-labelledby="habits-heading"
        className="mt-[76px]"
      >
        <SectionHead
          id="habits-heading"
          label={`${HABITS.length + 1} habits · drag to correct`}
          note="Habits, not rules. I lean this way unless a trip calls for something else."
        >
          How you like your <em>days</em>
        </SectionHead>
        <ul className="grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {HABITS.map((habit) => {
            const info = topics.find((item) => item.topic === habit.topic);
            const entry = entries.find((item) => item.topic === habit.topic);
            const name = TOPIC_NAMES[habit.topic];
            const value = moved[habit.topic] ?? entry?.value ?? habit.unset;
            const index = Math.max(habit.stops.indexOf(value), 0);
            const label = (stop: string) =>
              info?.choices.find((choice) => choice.value === stop)?.label ??
              stop;
            const guess = entry?.sureness === "think";
            // Saved when the slider is let go, not at every step on the way.
            // It stays where it was let go until the save has answered, so
            // it does not jump back and a second arrow key starts from there.
            const settle = () => {
              const next = moved[habit.topic];
              if (next === undefined) return;
              const done = () =>
                setMoved((current) =>
                  current[habit.topic] === next
                    ? { ...current, [habit.topic]: undefined }
                    : current,
                );
              if (next === entry?.value) return done();
              void (
                entry ? change(entry, next) : tell(label(next), false)
              ).finally(done);
            };
            return (
              <li
                key={habit.topic}
                className={`relative flex flex-col px-6 pt-[22px] pb-5 ${lift} ${guess ? guessCard : card}`}
              >
                <p className={eyebrow}>{name}</p>
                <h3 className="mt-2.5 text-[28px] leading-[1.1] tracking-[-0.015em] italic">
                  {habit.says[habit.stops[index]]}
                </h3>
                <p className="mt-2 text-[14px] text-muted">
                  {habit.does[habit.stops[index]]}
                </p>
                <input
                  type="range"
                  min={0}
                  max={habit.stops.length - 1}
                  step={1}
                  value={index}
                  aria-label={name}
                  aria-valuetext={label(habit.stops[index])}
                  onChange={(event) =>
                    setMoved((current) => ({
                      ...current,
                      [habit.topic]: habit.stops[Number(event.target.value)],
                    }))
                  }
                  onPointerUp={settle}
                  onKeyUp={settle}
                  onBlur={settle}
                  className="keepsake-range mt-6"
                  style={
                    {
                      "--fill": `${(index / (habit.stops.length - 1)) * 100}%`,
                    } as CSSProperties
                  }
                />
                <p
                  aria-hidden
                  className="mt-1.5 flex justify-between font-mono text-[10px] tracking-[0.06em] text-muted uppercase"
                >
                  {habit.stops.map((stop, at) => (
                    <span key={stop} className={at === index ? "text-ink" : ""}>
                      {label(stop)}
                    </span>
                  ))}
                </p>
                <div className="mt-auto pt-6">
                  {!entry ? (
                    <p className="border-t border-ink/12 pt-3.5 text-[13px] text-muted">
                      Not set yet. Move the slider to tell me.
                    </p>
                  ) : guess ? (
                    <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-terracotta/8 py-3 pr-3 pl-4 text-[13.5px]">
                      <p className="min-w-0 flex-1 leading-snug font-medium">
                        Still a guess, {sourceWords(entry.source)}. Is this
                        right?
                      </p>
                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        aria-label={`Yes, ${entry.label} is right`}
                        onClick={() => void change(entry, entry.value)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={quiet}
                        disabled={busy}
                        aria-label={`Remove ${name}`}
                        onClick={() => void remove(entry)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <p className="flex flex-wrap items-center gap-x-3 border-t border-ink/12 pt-3.5 text-[13px] text-muted">
                      <Sure sureness={entry.sureness} />
                      <span className="first-letter:uppercase">
                        · {sourceWords(entry.source)}
                      </span>
                      <button
                        type="button"
                        className={`${quiet} ml-auto`}
                        disabled={busy}
                        aria-label={`Remove ${name}`}
                        onClick={() => void remove(entry)}
                      >
                        Remove
                      </button>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
          <BudgetCard
            key={budget?.value ?? "unset"}
            entry={budget}
            rates={rates}
            busy={busy}
            onSave={(next) =>
              void send("/budget", { method: "PUT", body: next })
            }
            onRemove={(entry) => void remove(entry)}
          />
        </ul>
      </section>

      {tastes.length > 0 && (
        <section aria-labelledby="tastes-heading" className="mt-[76px]">
          <SectionHead
            id="tastes-heading"
            label={`${tastes.length} ${tastes.length === 1 ? "taste" : "tastes"}`}
            note="The dots show how sure I am. Three dots means you told me yourself."
          >
            What you <em>gravitate</em> to
          </SectionHead>
          <ul className="grid gap-[18px] md:grid-cols-2">
            {tastes.map((entry) => {
              const guess = entry.sureness === "think";
              return (
                <li
                  key={entry.id}
                  className={`relative flex flex-col gap-4 px-[22px] py-5 ${lift} ${guess ? guessCard : card}`}
                >
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4">
                    <Icon name={icons[entry.topic] ?? entry.topic} />
                    {editing === entry.id ? (
                      editForm(entry)
                    ) : (
                      <div className="min-w-0">
                        <p className={eyebrow}>{TOPIC_NAMES[entry.topic]}</p>
                        <h3 className="mt-1.5 text-[25px] leading-[1.1] tracking-[-0.015em] [overflow-wrap:anywhere]">
                          {entry.label}
                        </h3>
                        <p className="mt-1.5 text-[13px] text-muted first-letter:uppercase">
                          {sourceWords(entry.source)}
                        </p>
                      </div>
                    )}
                  </div>
                  {guess && editing !== entry.id ? (
                    <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-terracotta/8 py-3 pr-3 pl-4 text-[13.5px]">
                      <p className="min-w-0 flex-1 leading-snug font-medium">
                        Still a guess. Is this right?
                      </p>
                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        aria-label={`Yes, ${entry.label} is right`}
                        onClick={() => void change(entry, entry.value)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={buttonSecond}
                        aria-label={`${entry.label} is not quite right`}
                        onClick={() => setEditing(entry.id)}
                      >
                        Not quite
                      </button>
                      <button
                        type="button"
                        className={quiet}
                        disabled={busy}
                        aria-label={`Remove ${entry.label}`}
                        onClick={() => void remove(entry)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <p className="mt-auto flex flex-wrap items-center gap-x-3 border-t border-ink/12 pt-3.5 text-[13px] text-muted">
                      <Sure sureness={entry.sureness} />
                      {actions(entry)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section aria-labelledby="notes-heading" className="mt-[76px]">
          <SectionHead
            id="notes-heading"
            label={`${notes.length} ${notes.length === 1 ? "note" : "notes"} · not yet affecting suggestions`}
            note="I keep these as you said them. They do not change what I suggest yet."
          >
            Things I have <em>noted</em>
          </SectionHead>
          <ul data-qa="profile-notes" className="grid gap-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-[22px] py-4 ${card}`}
              >
                <p className="min-w-0 flex-1 font-serif text-[21px] leading-snug italic [overflow-wrap:anywhere]">
                  {note.text}
                </p>
                <button
                  type="button"
                  className={quiet}
                  disabled={busy}
                  aria-label={`Remove the note: ${note.text}`}
                  onClick={() =>
                    void send(`/notes/${note.id}`, { method: "DELETE" })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shaped && shaped.pairs.length > 0 && (
        <section
          data-qa="profile-shaped"
          aria-labelledby="shaped-heading"
          className="mt-[84px] grid gap-8 rounded-[20px] bg-ink px-6 py-8 text-paper md:px-12 md:py-11 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16"
        >
          <div>
            <p className="font-mono text-[11px] tracking-[0.14em] text-paper/60 uppercase">
              Why this matters
            </p>
            <h2
              id="shaped-heading"
              className="mt-2.5 font-serif text-[34px] leading-[1.04] tracking-[-0.03em] [overflow-wrap:anywhere] md:text-[46px] [&_em]:text-[#e2a07c]"
            >
              How this shaped <em>{shaped.title}</em>
            </h2>
            <p className="mt-3.5 text-[15.5px] text-paper/70">
              Each line can be seen in that trip&rsquo;s plan.
            </p>
            <Link
              href={`/trips/${shaped.tripId}`}
              className="mt-5 inline-flex min-h-8 items-center text-[14.5px] font-medium underline decoration-paper/40 decoration-[1.5px] underline-offset-4 transition-colors duration-150 hover:decoration-paper"
            >
              Open the trip
            </Link>
          </div>
          <ul>
            {shaped.pairs.map(({ memory, effect }) => (
              <li
                key={memory}
                className="grid items-center gap-x-5 gap-y-2 border-b border-paper/15 py-[18px] first:pt-1 md:grid-cols-[1fr_auto_1fr]"
              >
                <span className="font-serif text-[23px] leading-[1.15] italic">
                  {memory}
                </span>
                <span
                  aria-hidden
                  className="grid size-[34px] place-items-center rounded-full shadow-[inset_0_0_0_1.5px_rgb(244_238_227/0.35)] max-md:rotate-90"
                >
                  →
                </span>
                <span className="text-[15px] text-paper/85">
                  <span className="mb-0.5 block font-mono text-[10.5px] tracking-[0.14em] text-paper/60 uppercase">
                    So in this trip
                  </span>
                  {effect}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const text = draft.trim();
          if (text && (await tell(text, hard))) {
            setDraft("");
            setHard(false);
          }
        }}
        aria-labelledby="tell-heading"
        className={`mt-[84px] grid gap-7 rounded-[20px] px-6 py-8 md:px-12 md:py-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16 ${card}`}
      >
        <div>
          <p className={eyebrow}>Add something</p>
          <h2 id="tell-heading" className={`mt-2.5 ${sectionTitle}`}>
            Tell me something <em>new</em>
          </h2>
          <p className="mt-3 text-[15.5px] text-muted">
            Say it however you like. I show you where it belongs before I save
            it.
          </p>
        </div>
        <div>
          <label
            htmlFor="tell"
            className="block font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase"
          >
            What should I remember?
          </label>
          <textarea
            id="tell"
            name="text"
            required
            rows={2}
            maxLength={300}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-describedby="tell-example"
            className={`${fieldLarge} mt-2 block w-full resize-none rounded-xl px-[18px] py-4 font-serif text-[22px] leading-tight italic`}
          />
          <p id="tell-example" className="mt-2.5 text-[12.5px] text-muted">
            For example: “I’m vegetarian”, “allergic to shellfish”, or “I get
            tired of museums after two hours”.
          </p>
          <p
            aria-live="polite"
            className="mt-3.5 inline-flex min-h-8 items-center rounded-full bg-tint px-3 text-[13px] text-ink/75 empty:hidden"
          >
            {filing &&
              (filing.type === "entry" ? (
                <>
                  I would file this under&nbsp;
                  <b className="font-medium text-ink">
                    {TOPIC_NAMES[filing.topic]}
                  </b>
                </>
              ) : (
                "I would keep this as a note. It will not affect suggestions yet."
              ))}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
            <button type="submit" className={buttonLarge} disabled={busy}>
              Remember this
              <span aria-hidden className={buttonArrow}>
                →
              </span>
            </button>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={hard}
                onChange={(event) => setHard(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="relative h-[22px] w-[38px] rounded-full bg-tint shadow-[inset_0_0_0_1px_rgb(29_26_22/0.2)] transition-colors duration-150 peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-terracotta after:absolute after:top-[3px] after:left-[3px] after:size-4 after:rounded-full after:bg-card after:shadow-[0_1px_3px_rgb(29_26_22/0.3)] after:transition-transform after:duration-150 peer-checked:after:translate-x-4"
              />
              Make it a rule I never break
            </label>
          </div>

          <details className="mt-7 border-t border-ink/12 pt-5">
            <summary className={`${quiet} cursor-pointer`}>
              Or pick from what I understand
            </summary>
            <div className="mt-4 space-y-4">
              {topics
                .filter(
                  (info) =>
                    info.choices.length > 0 &&
                    !HABIT_TOPICS.includes(info.topic),
                )
                .map((info) => (
                  <fieldset key={info.topic} disabled={busy}>
                    <legend className={eyebrow}>{info.name}</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {info.choices.map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          className={chip}
                          aria-pressed={entries.some(
                            (entry) =>
                              entry.topic === info.topic &&
                              entry.value === choice.value,
                          )}
                          onClick={() =>
                            void tell(choice.label, info.kind === "hard_limit")
                          }
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
            </div>
          </details>
        </div>
      </form>

      <div aria-live="polite" className="mt-4 min-h-6 font-sans text-[14px]">
        {said && <p data-qa="profile-said">{said}</p>}
        <p role="alert" className="text-stamp">
          {problem}
        </p>
      </div>

      <button
        type="button"
        className={`${quiet} mt-6`}
        onClick={() => forget.current?.showModal()}
      >
        Forget everything and start again
      </button>
      <dialog
        ref={forget}
        aria-labelledby="forget-heading"
        className="m-auto w-[min(92vw,26rem)] rounded-2xl bg-card p-7 text-ink shadow-lift backdrop:bg-ink/40"
      >
        <h3
          id="forget-heading"
          className="font-serif text-[26px] leading-tight"
        >
          Forget everything?
        </h3>
        <p className="mt-3 text-[15px] text-ink/80">
          Every rule, taste and note here will be removed, and your past trips
          will not teach me them again. This cannot be undone.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            className={button}
            onClick={async () => {
              await send("", { method: "DELETE" });
              forget.current?.close();
            }}
          >
            Forget everything
          </button>
          <button
            type="button"
            className={buttonSecond}
            onClick={() => forget.current?.close()}
          >
            Keep it
          </button>
        </div>
      </dialog>
    </div>
  );
}
