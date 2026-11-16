"use client";

import Link from "next/link";
import {
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  CURRENCIES,
  budgetStops,
  formatMoney,
  type Currency,
  type Rates,
} from "@/features/prototype/currency";
import {
  confirm,
  guessTopic,
  habitText,
  moveHabit,
  sureness,
} from "@/features/prototype/profile";
import type {
  ProfileEntry,
  ProfileTopic,
} from "@/features/prototype/sample-home";

import { Stamp } from "./day-stamp";
import {
  button,
  buttonArrow,
  buttonLarge,
  buttonSecond,
  eyebrow,
  field,
  fieldLarge,
  lift,
  pageTitle,
  quiet,
  sectionTitle,
} from "./styles";

type Entry = ProfileEntry & { id: number };

const topicName: Partial<Record<ProfileTopic, string>> = {
  pace: "Pace",
  "day shape": "Start of the day",
  budget: "Daily budget",
};
const card =
  "rounded-2xl bg-card shadow-[0_0_0_1px_rgb(29_26_22/0.12),var(--shadow-sheet)]";
// A guess the traveller has not confirmed gets a terracotta edge.
const guessCard =
  "rounded-2xl bg-card shadow-[0_0_0_1.5px_rgb(164_80_44/0.5),var(--shadow-sheet)]";
const rise = (i: number) => ({ "--i": i }) as CSSProperties;

const paths: Record<string, ReactNode> = {
  interests: <path d="M3 10l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 20h18" />,
  "getting around": (
    <>
      <rect x="6" y="3" width="12" height="14" rx="3" />
      <path d="M6 11h12M9 21l2-4M15 21l-2-4" />
    </>
  ),
  atmosphere: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  stay: (
    <path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M3 18v2M21 18v2M7 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
  ),
  food: <path d="M5 19c0-8 5-13 14-14 0 9-4 14-12 14M5 19c2-4 5-7 9-9" />,
  never: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </>
  ),
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid size-11 shrink-0 place-items-center rounded-full bg-tint ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[22px] fill-none stroke-current stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]"
      >
        {paths[name] ?? <circle cx="12" cy="12" r="7" />}
      </svg>
    </span>
  );
}

function Sure({ entry }: { entry: Entry }) {
  const { dots, label } = sureness(entry);
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="flex gap-1">
        {[1, 2, 3].map((dot) => (
          <span
            key={dot}
            className={`size-2 rounded-full ${dot <= dots ? "bg-ink" : "bg-tint"}`}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

export function ProfileList({
  initial,
  rates,
}: {
  initial: ProfileEntry[];
  /** Today's exchange rates, or null when they could not be fetched. */
  rates: Rates | null;
}) {
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [entries, setEntries] = useState<Entry[]>(() =>
    initial.map((entry, id) => ({ ...entry, id })),
  );
  const nextId = useRef(initial.length);
  const [editing, setEditing] = useState<number | null>(null);
  // Entries confirmed in this visit show a stamp.
  const [stamped, setStamped] = useState<number[]>([]);
  const [draft, setDraft] = useState("");

  const change = (id: number, update: (entry: Entry) => ProfileEntry) =>
    setEntries((list) =>
      list.map((entry) => (entry.id === id ? { ...update(entry), id } : entry)),
    );
  const remove = (id: number) =>
    setEntries((list) => list.filter((entry) => entry.id !== id));
  const say = (entry: Entry) => {
    change(entry.id, confirm);
    setStamped((list) => [...list, entry.id]);
  };

  function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    const hard = new FormData(event.currentTarget).get("hard");
    setEntries((list) => [
      ...list,
      {
        id: nextId.current++,
        topic: guessTopic(value),
        value,
        kind: hard ? "hard limit" : "taste",
        sureness: "always",
        source: "you told me",
      },
    ]);
    setDraft("");
    event.currentTarget.reset();
  }

  const rules = entries.filter((e) => e.kind === "hard limit");
  const habits = entries.filter((e) => e.kind === "taste" && e.scale);
  const tastes = entries.filter((e) => e.kind === "taste" && !e.scale);

  const actions = (entry: Entry, name: string) => (
    <span className="ml-auto flex gap-4">
      <button
        type="button"
        className={quiet}
        aria-label={`Change ${name}`}
        onClick={() => setEditing(entry.id)}
      >
        Change
      </button>
      <button
        type="button"
        className={quiet}
        aria-label={`Remove ${name}`}
        onClick={() => remove(entry.id)}
      >
        Remove
      </button>
    </span>
  );

  const editForm = (entry: Entry) => (
    <form
      className="flex min-w-0 gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = String(
          new FormData(event.currentTarget).get("value"),
        ).trim();
        if (value) change(entry.id, (e) => confirm({ ...e, value }));
        setEditing(null);
      }}
    >
      <input
        name="value"
        defaultValue={entry.value}
        aria-label={`Change ${entry.value}`}
        autoFocus
        className={`${fieldLarge} min-w-0 flex-1`}
      />
      <button type="submit" className={button}>
        Save
      </button>
    </form>
  );

  const ask = (entry: Entry, onNotQuite: () => void) => (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-terracotta/8 py-3 pr-3 pl-4 text-[13.5px]">
      <p className="min-w-0 flex-1 leading-snug font-medium">
        Still a guess. Is this right?
        <span className="block font-normal text-muted first-letter:uppercase">
          {entry.source}
        </span>
      </p>
      <button
        type="button"
        className={button}
        aria-label={`Yes, ${entry.value} is right`}
        onClick={() => say(entry)}
      >
        Yes
      </button>
      <button
        type="button"
        className={buttonSecond}
        aria-label={`${entry.value} is not quite right`}
        onClick={onNotQuite}
      >
        Not quite
      </button>
    </div>
  );

  const confirmed = (entry: Entry, place = "top-4 right-4") =>
    stamped.includes(entry.id) && (
      <span className={`stamp-in absolute ${place}`}>
        <Stamp label="CONFIRMED" spoken="Confirmed by you" />
      </span>
    );

  return (
    <div className="py-10 md:py-14">
      <section className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_350px] lg:gap-[72px]">
        <div>
          <p
            className="rise inline-flex min-h-8 items-center gap-2.5 rounded-full bg-card py-1 pr-3.5 pl-1.5 text-[13px] text-ink/75 shadow-[0_0_0_1px_rgb(29_26_22/0.12)]"
            style={rise(0)}
          >
            <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-ink px-2.5 font-mono text-[10.5px] tracking-[0.1em] text-paper uppercase">
              What I remember
            </span>
            Learned from 2 trips
          </p>
          {/* Sample sentence: the real product writes this from the entries below. */}
          <h1 className={`rise mt-6 ${pageTitle}`} style={rise(1)}>
            You travel <em>slowly,</em> start late, and never eat shellfish.
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
            <span className="grid size-[54px] shrink-0 place-items-center rounded-full bg-ink font-serif text-[28px] leading-none text-paper">
              T
            </span>
            <p>
              <span className="block font-serif text-[25px] leading-tight">
                Your travel passport
              </span>
              <span className="text-[13px] text-muted">
                Travelling with TravleBuddy since 2026
              </span>
            </p>
          </div>
          <p className={`${eyebrow} px-6 pt-5`}>Learned from</p>
          <div className="flex flex-wrap gap-x-1 gap-y-4 px-4 pt-4 pb-5">
            <Stamp label="KYOTO · 2026" spoken="Kyoto, 2026" />
            <Stamp label="LISBON · 2027" spoken="Lisbon, 2027" />
          </div>
          <dl className="grid grid-cols-2 border-t border-ink/12">
            {[
              [rules.length, "rules I never break"],
              [habits.length + tastes.length, "things you usually like"],
            ].map(([count, name], index) => (
              <div
                key={name}
                className={`px-6 pt-4 pb-[18px] ${index ? "border-l border-ink/12" : ""}`}
              >
                <dd className="font-serif text-[40px] leading-none">{count}</dd>
                <dt className="mt-1 text-[12.5px] text-muted">{name}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <ol className="mt-14 grid border-y border-ink/12 md:grid-cols-3">
        {[
          [
            "I learn as we plan",
            "When you pick, skip or correct something, I notice the pattern.",
          ],
          [
            "It is only a starting point",
            "What you say about one trip always wins, and does not change this page.",
          ],
          [
            "You are in charge",
            "Correct anything that is wrong, or remove it. I will not argue.",
          ],
        ].map(([title, text], index) => (
          <li
            key={title}
            className="border-ink/12 py-6 max-md:not-first:border-t md:px-7 md:first:pl-0 md:not-first:border-l"
          >
            <span className="font-mono text-[11px] tracking-[0.14em] text-terracotta">
              0{index + 1}
            </span>
            <h2 className="mt-3 text-[24px] leading-[1.1] tracking-[-0.015em]">
              {title}
            </h2>
            <p className="mt-2 text-[15px] text-muted">{text}</p>
          </li>
        ))}
      </ol>

      {entries.length === 0 && (
        <p className="mt-14 font-serif text-2xl italic">
          Nothing yet. I will start fresh on your next trip.
        </p>
      )}

      {rules.length > 0 && (
        <section aria-labelledby="rules-heading" className="mt-[76px]">
          <SectionHead
            id="rules-heading"
            label={`${rules.length} rules · apply to every trip`}
            note="I will not suggest a place that breaks one of these, however well it fits otherwise."
          >
            Rules I <em>never</em> break
          </SectionHead>
          <ul className="grid gap-[18px] md:grid-cols-2">
            {rules.map((entry) => (
              <li
                key={entry.id}
                className="relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-[18px] rounded-2xl bg-card px-6 py-6 shadow-[0_0_0_1.5px_rgb(138_36_32/0.35),var(--shadow-sheet)]"
              >
                <Icon
                  name={/^no\b/i.test(entry.value) ? "never" : "food"}
                  className="size-[52px] bg-stamp/10 text-stamp"
                />
                <div className="min-w-0">
                  {editing === entry.id ? (
                    editForm(entry)
                  ) : (
                    <>
                      <h3 className="pr-20 text-[31px] leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]">
                        {entry.value}
                      </h3>
                      {entry.detail && (
                        <p className="mt-2 text-[14.5px] text-ink/75">
                          {entry.detail}
                        </p>
                      )}
                      <p className="mt-4 flex flex-wrap items-center gap-x-4 text-[13px] text-muted">
                        <span className="first-letter:uppercase">
                          {entry.source}
                        </span>
                        {actions(entry, entry.value)}
                      </p>
                    </>
                  )}
                </div>
                <span className="absolute top-5 right-4">
                  <Stamp
                    label={/^no\b/i.test(entry.value) ? "NEVER" : "ALWAYS"}
                    spoken="A rule I never break"
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {habits.length > 0 && (
        <section aria-labelledby="habits-heading" className="mt-[76px]">
          <SectionHead
            id="habits-heading"
            label={`${habits.length} habits · drag to correct`}
            note="Habits, not rules. I lean this way unless a trip calls for something else."
          >
            How you like your <em>days</em>
          </SectionHead>
          <ul className="grid gap-[18px] md:grid-cols-3">
            {habits.map((entry) => {
              // Money is kept in yen and written in the traveller's currency.
              const yen = entry.scale!.yen;
              const scale = yen
                ? { ...entry.scale!, stops: budgetStops(yen, currency, rates) }
                : entry.scale!;
              const name = topicName[entry.topic] ?? entry.topic;
              const guess = entry.sureness === "I think";
              return (
                <li
                  key={entry.id}
                  className={`relative flex flex-col px-6 pt-[22px] pb-5 ${lift} ${guess ? guessCard : card}`}
                >
                  <div className="flex min-h-8 items-center justify-between gap-3">
                    <p className={eyebrow}>{name}</p>
                    {yen && (
                      <select
                        aria-label="Currency for your daily budget"
                        value={rates ? currency : "JPY"}
                        disabled={!rates}
                        onChange={(event) => {
                          const next = event.target.value as Currency;
                          setCurrency(next);
                          // The saved sentence follows the currency shown.
                          change(entry.id, (e) => ({
                            ...e,
                            value: habitText({
                              ...scale,
                              stops: budgetStops(yen, next, rates),
                            }),
                          }));
                        }}
                        className={`${field} h-8 cursor-pointer py-0 font-mono tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {CURRENCIES.map((code) => (
                          <option key={code}>{code}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <h3 className="mt-2.5 text-[28px] leading-[1.1] tracking-[-0.015em] italic">
                    {habitText(scale)}
                  </h3>
                  {confirmed(entry, "top-14 right-4")}
                  <input
                    type="range"
                    id={`habit-${entry.id}`}
                    min={0}
                    max={scale.stops.length - 1}
                    step={1}
                    value={scale.index}
                    aria-label={name}
                    aria-valuetext={scale.stops[scale.index]}
                    onChange={(event) =>
                      change(entry.id, (e) => {
                        const index = Number(event.target.value);
                        const moved = moveHabit(e, index);
                        return yen
                          ? { ...moved, value: habitText({ ...scale, index }) }
                          : moved;
                      })
                    }
                    className="keepsake-range mt-6"
                    style={
                      {
                        "--fill": `${(scale.index / (scale.stops.length - 1)) * 100}%`,
                      } as CSSProperties
                    }
                  />
                  <p
                    aria-hidden
                    className="mt-1.5 flex justify-between font-mono text-[10px] tracking-[0.06em] text-muted uppercase"
                  >
                    {scale.stops.map((stop, index) => (
                      <span
                        key={stop}
                        className={index === scale.index ? "text-ink" : ""}
                      >
                        {stop}
                      </span>
                    ))}
                  </p>
                  {yen && (
                    <p
                      aria-live="polite"
                      className="mt-3 text-[12.5px] leading-snug text-muted"
                    >
                      {!rates
                        ? "Exchange rates are unavailable right now, so amounts stay in yen."
                        : currency === "JPY"
                          ? "Choose a currency above to see this converted at today’s rate."
                          : `1 ${currency} = ${formatMoney(Number((1 / rates.perYen[currency]).toPrecision(3)), "JPY")} · European Central Bank rate of ${rateDay(rates.date)}. Amounts are rounded.`}
                    </p>
                  )}
                  <div className="mt-auto pt-6">
                    {guess ? (
                      ask(entry, () =>
                        document.getElementById(`habit-${entry.id}`)?.focus(),
                      )
                    ) : (
                      <p className="flex flex-wrap items-center gap-x-3 border-t border-ink/12 pt-3.5 text-[13px] text-muted">
                        <Sure entry={entry} />
                        <span className="first-letter:uppercase">
                          · {entry.source}
                        </span>
                        <button
                          type="button"
                          className={`${quiet} ml-auto`}
                          aria-label={`Remove ${name}`}
                          onClick={() => remove(entry.id)}
                        >
                          Remove
                        </button>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tastes.length > 0 && (
        <section aria-labelledby="tastes-heading" className="mt-[76px]">
          <SectionHead
            id="tastes-heading"
            label={`${tastes.length} tastes`}
            note="The dots show how sure I am. Three dots means you told me yourself."
          >
            What you <em>gravitate</em> to
          </SectionHead>
          <ul className="grid gap-[18px] md:grid-cols-2">
            {tastes.map((entry) => {
              const guess = entry.sureness === "I think";
              return (
                <li
                  key={entry.id}
                  className={`relative flex flex-col gap-4 px-[22px] py-5 ${lift} ${guess ? guessCard : card}`}
                >
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4">
                    <Icon name={entry.topic} />
                    {editing === entry.id ? (
                      editForm(entry)
                    ) : (
                      <div className="min-w-0">
                        <h3 className="text-[25px] leading-[1.1] tracking-[-0.015em] [overflow-wrap:anywhere]">
                          {entry.value}
                        </h3>
                        <p className="mt-1.5 text-[13px] text-muted first-letter:uppercase">
                          {entry.source}
                        </p>
                      </div>
                    )}
                  </div>
                  {confirmed(entry)}
                  {guess ? (
                    ask(entry, () => setEditing(entry.id))
                  ) : (
                    <p className="mt-auto flex flex-wrap items-center gap-x-3 border-t border-ink/12 pt-3.5 text-[13px] text-muted">
                      <Sure entry={entry} />
                      {actions(entry, entry.value)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Sample consequences: memory is only understandable if you can see what it did. */}
      <section
        aria-labelledby="shaped-heading"
        className="mt-[84px] grid gap-8 rounded-[20px] bg-ink px-6 py-8 text-paper md:px-12 md:py-11 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16"
      >
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-paper/60 uppercase">
            Why this matters
          </p>
          <h2
            id="shaped-heading"
            className="mt-2.5 text-[34px] leading-[1.04] tracking-[-0.03em] md:text-[46px] [&_em]:text-[#e2a07c]"
          >
            How this shaped <em>Tokyo</em>
          </h2>
          <p className="mt-3.5 text-[15.5px] text-paper/70">
            Every suggestion can be traced back to something on this page.
          </p>
          <Link
            href="/prototype/trip"
            className="mt-5 inline-flex min-h-8 items-center text-[14.5px] font-medium underline decoration-paper/40 decoration-[1.5px] underline-offset-4 transition-colors duration-150 hover:decoration-paper"
          >
            Open the Tokyo trip
          </Link>
        </div>
        <ul>
          {[
            ["Late starts, around ten", "Every day begins at 10:00"],
            ["Vegetarian food", "Every meal has vegetarian choices"],
            [
              "A relaxed pace",
              "One main sight each morning, then time to wander",
            ],
          ].map(([memory, effect]) => (
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
                  So in Tokyo
                </span>
                {effect}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <form
        onSubmit={addEntry}
        aria-labelledby="tell-heading"
        className={`mt-7 grid gap-7 rounded-[20px] px-6 py-8 md:px-12 md:py-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16 ${card}`}
      >
        <div>
          <p className={eyebrow}>Add something</p>
          <h2 id="tell-heading" className={`mt-2.5 ${sectionTitle}`}>
            Tell me something <em>new</em>
          </h2>
          <p className="mt-3 text-[15.5px] text-muted">
            Say it however you like. I work out where it belongs and show you
            before I save it.
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
            name="value"
            required
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-describedby="tell-example"
            className={`${fieldLarge} mt-2 block w-full resize-none rounded-xl px-[18px] py-4 font-serif text-[22px] leading-tight italic`}
          />
          <p id="tell-example" className="mt-2.5 text-[12.5px] text-muted">
            For example: “I get tired of museums after two hours” or “I need a
            lift, I can’t do stairs”.
          </p>
          <p
            aria-live="polite"
            className="mt-3.5 inline-flex min-h-8 items-center rounded-full bg-tint px-3 text-[13px] text-ink/75 empty:hidden"
          >
            {draft.trim() && (
              <>
                I would file this under&nbsp;
                <b className="font-medium text-ink capitalize">
                  {guessTopic(draft)}
                </b>
              </>
            )}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
            <button type="submit" className={buttonLarge}>
              Remember this
              <span aria-hidden className={buttonArrow}>
                →
              </span>
            </button>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" name="hard" className="peer sr-only" />
              <span
                aria-hidden
                className="relative h-[22px] w-[38px] rounded-full bg-tint shadow-[inset_0_0_0_1px_rgb(29_26_22/0.2)] transition-colors duration-150 peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-terracotta after:absolute after:top-[3px] after:left-[3px] after:size-4 after:rounded-full after:bg-card after:shadow-[0_1px_3px_rgb(29_26_22/0.3)] after:transition-transform after:duration-150 peer-checked:after:translate-x-4"
              />
              Make it a rule I never break
            </label>
          </div>
        </div>
      </form>

      <button
        type="button"
        className={`${quiet} mt-8`}
        onClick={() => {
          if (window.confirm("Forget everything I remember about you?")) {
            setEntries([]);
          }
        }}
      >
        Forget everything and start again
      </button>
    </div>
  );
}

/** "2026-11-13" as "13 Nov 2026", the same on the server and in the browser. */
function rateDay(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(day.getTime())
    ? date
    : day.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

function SectionHead({
  id,
  label,
  note,
  children,
}: {
  id: string;
  label: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
      <div>
        <p className={eyebrow}>{label}</p>
        <h2 id={id} className={`mt-2.5 ${sectionTitle}`}>
          {children}
        </h2>
      </div>
      <p className="max-w-[24rem] text-[15.5px] text-muted md:text-right">
        {note}
      </p>
    </header>
  );
}
