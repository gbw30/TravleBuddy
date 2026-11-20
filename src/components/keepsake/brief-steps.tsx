"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { TasteTopic } from "@/features/memory/contracts";
import { positionedCities } from "@/features/places/contracts";
import type { TripFacts } from "@/features/trips/contracts";
import { changeTrip } from "@/lib/trip-api";
import {
  BRIEF_STEPS,
  changedFacts,
  step1Problems,
  toggleStyle,
  type BriefProblem,
  type BriefSave,
  type BriefView,
} from "@/use-cases/brief-view";

import {
  BudgetFields,
  FirmnessChoice,
  PURPOSES,
  WhenFields,
  WhereFields,
  WhoFields,
} from "./facts-fields";
import {
  buttonLarge,
  buttonSecond,
  chip,
  eyebrow,
  field,
  quiet,
  quietLarge,
} from "./styles";
import { TripCommitments } from "./trip-commitments";

const legend = "font-serif text-[21px] leading-tight";
const aside = "mt-1 font-sans text-[13px] text-muted";
const sheet =
  "rounded-lg bg-card px-4 py-3 shadow-[0_0_0_1px_rgb(29_26_22/0.12)]";

type Group = "where" | "when" | "who";
const GROUP_OF: Record<BriefProblem["field"], Group> = {
  cities: "where",
  nights: "where",
  dates: "when",
  who: "who",
};

function Question({
  asks,
  note,
  children,
}: {
  asks: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className={legend}>{asks}</legend>
      {note && <p className={aside}>{note}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selected.includes(option.value)}
          onClick={() => onToggle(option.value)}
          className={chip}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The trip brief of Quick plan (PRD 11.1): five short steps over the trip's
 * own facts, commitments and taste. A step is saved when the traveller
 * leaves it, so nothing is lost by going back or coming back later.
 */
export function BriefSteps({
  initial,
  startAt,
}: {
  initial: BriefView;
  startAt: number;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState(initial);
  // The page read the trip again, after a change to what is already decided.
  // shortcut: a draft kept across this overwrites facts changed in another tab; rebase the draft if two tabs become common.
  if (initial.revision > brief.revision) setBrief(initial);

  const [step, setStep] = useState(startAt);
  // What the traveller has entered and not yet saved. A save sends only the
  // facts that differ from `brief.facts`, and this page has no conversation
  // that could change them meanwhile (see the shortcut above for two tabs).
  const [facts, setFacts] = useState(() =>
    // Opened straight at "This trip": the remembered budget is filled in.
    startAt === 2 &&
    initial.rememberedBudget &&
    initial.facts.budgetAmount === null
      ? {
          ...initial.facts,
          budgetAmount: initial.rememberedBudget.amount,
          budgetCurrency: initial.rememberedBudget.currency,
          budgetBasis: "DAY" as const,
        }
      : initial.facts,
  );
  const [style, setStyle] = useState<Partial<Record<TasteTopic, string[]>>>({});
  const [said, setSaid] = useState(initial.said?.text ?? "");
  const [touched, setTouched] = useState<Group[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // False on the server, true once the form can take input.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // A new step is announced by moving to its name.
  const marker = useRef<HTMLParagraphElement>(null);
  const shownStep = useRef(startAt);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    marker.current?.focus();
  }, [step]);

  const problems = step1Problems(facts);
  const problemOf = (group: Group) =>
    tried || touched.includes(group)
      ? problems
          .filter((problem) => GROUP_OF[problem.field] === group)
          .map((problem) => problem.message)
          .join(" ")
      : undefined;
  const setIn = (group: Group) => (change: Partial<TripFacts>) => {
    setFacts((current) => ({ ...current, ...change }));
    setTouched((current) =>
      current.includes(group) ? current : [...current, group],
    );
  };
  const setFact = (change: Partial<TripFacts>) =>
    setFacts((current) => ({ ...current, ...change }));

  async function send(part: BriefSave): Promise<boolean> {
    if (Object.keys(part).length === 0) return true;
    setBusy(true);
    const result = await changeTrip<{ brief: BriefView }>(
      brief.tripId,
      brief.revision,
      "PUT",
      part,
      "/brief",
    );
    setBusy(false);
    if (!result.ok) {
      setFailure(result.message);
      // Someone changed the trip elsewhere: read it again, keep what is typed.
      if (result.error === "stale_revision") router.refresh();
      return false;
    }
    const saved = result.data.brief;
    setBrief(saved);
    setFailure(null);
    if (part.facts) setFacts(saved.facts);
    if (part.style) setStyle({});
    if (part.said !== undefined) setSaid(saved.said?.text ?? "");
    return true;
  }

  /** Saves what this step changed. False when the save was refused. */
  function save(): Promise<boolean> {
    const part: BriefSave = {};
    const changed = changedFacts(brief.facts, facts);
    // An end before the start is explained beside the dates; it is not sent.
    const datesWrong =
      facts.startDate && facts.endDate && facts.endDate < facts.startDate;
    if (Object.keys(changed).length > 0 && !datesWrong) part.facts = changed;
    if (Object.keys(style).length > 0) part.style = style;
    if (said.trim() !== (brief.said?.text ?? "")) part.said = said;
    return send(part);
  }

  const remembered = brief.rememberedBudget;
  const budgetFromMemory =
    remembered !== null &&
    facts.budgetAmount === remembered.amount &&
    facts.budgetCurrency === remembered.currency &&
    facts.budgetBasis === "DAY";
  function fillBudget() {
    if (!remembered) return;
    setFacts((current) =>
      current.budgetAmount === null
        ? {
            ...current,
            budgetAmount: remembered.amount,
            budgetCurrency: remembered.currency,
            budgetBasis: "DAY",
          }
        : current,
    );
  }

  async function go(target: number) {
    if (busy || !(await save())) return;
    // Only step 1 is required, and nothing after it opens without it.
    if (target > 0 && problems.length > 0) {
      setTried(true);
      setStep(0);
      return;
    }
    // The brief fills in what the profile knows: here, the usual daily
    // budget. It is saved for this trip when the traveller leaves the step.
    if (target === 2) fillBudget();
    setStep(target);
  }

  /**
   * Starts the build with its first day and opens the trip, where the rest
   * is built with the itinerary in view (PRD 11.3).
   */
  async function buildTrip() {
    if (busy || !(await save())) return;
    if (problems.length > 0) {
      setTried(true);
      setStep(0);
      return;
    }
    setBusy(true);
    const result = await changeTrip(
      brief.tripId,
      brief.revision,
      "POST",
      { start: true },
      "/build",
    );
    if (!result.ok) {
      setBusy(false);
      setFailure(result.message);
      return;
    }
    router.push(`/trips/${brief.tripId}`);
  }

  /**
   * Turns to the conversation, keeping everything entered: both ways of
   * planning read the same trip (PRD 11.5).
   */
  async function talkInstead() {
    if (busy || !(await save())) return;
    setBusy(true);
    const result = await changeTrip(brief.tripId, brief.revision, "PATCH", {
      action: "mode",
      planningMode: "GUIDED",
    });
    if (!result.ok) {
      setBusy(false);
      setFailure(result.message);
      return;
    }
    router.push(`/trips/${brief.tripId}`);
  }

  const last = BRIEF_STEPS.length - 1;

  return (
    <div data-qa="trip-brief" data-ready={ready}>
      <p
        ref={marker}
        tabIndex={-1}
        data-qa="brief-progress"
        className={`${eyebrow} outline-none`}
      >
        Step {step + 1} of {BRIEF_STEPS.length}: {BRIEF_STEPS[step]}
      </p>
      <div aria-hidden className="mt-2 flex gap-1">
        {BRIEF_STEPS.map((name, index) => (
          <span
            key={name}
            className={`h-[3px] flex-1 rounded-full ${index <= step ? "bg-ink" : "bg-ink/12"}`}
          />
        ))}
      </div>

      <div className="mt-8 space-y-9">
        {step === 0 && (
          <>
            <Question asks="Where are you going?">
              <WhereFields
                facts={facts}
                set={setIn("where")}
                problem={problemOf("where")}
              />
            </Question>
            <Question asks="When?">
              <WhenFields
                facts={facts}
                set={setIn("when")}
                problem={problemOf("when")}
              />
            </Question>
            <Question asks="Who is travelling?">
              <WhoFields
                facts={facts}
                set={setIn("who")}
                problem={problemOf("who")}
              />
            </Question>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-[17px] text-ink/80">
              Anything already booked or decided. I plan around these and never
              move them. Skip this if nothing is fixed yet.
            </p>
            <TripCommitments
              tripId={brief.tripId}
              revision={brief.revision}
              initial={{
                commitments: brief.commitments,
                clashes: brief.clashes,
              }}
              cities={positionedCities(brief.facts.cities)}
              readOnly={false}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Question asks="What is this trip for?">
              <Chips
                options={[
                  ...PURPOSES,
                  // A purpose given elsewhere in the traveller's own words.
                  ...(facts.purpose && !PURPOSES.includes(facts.purpose)
                    ? [facts.purpose]
                    : []),
                ].map((purpose) => ({ value: purpose, label: purpose }))}
                selected={facts.purpose ? [facts.purpose] : []}
                onToggle={(purpose) =>
                  setFact({
                    purpose: facts.purpose === purpose ? null : purpose,
                  })
                }
              />
            </Question>
            <Question
              asks="What is the budget?"
              note={
                budgetFromMemory && remembered
                  ? `What I remember (${remembered.source}). Change it here and only this trip changes.`
                  : "Leave it empty and I will leave costs for you to judge."
              }
            >
              <BudgetFields facts={facts} set={setFact} />
              <FirmnessChoice
                name="budget-firmness"
                value={facts.budgetFirmness}
                words={{
                  FIXED: "The budget is fixed",
                  FLEXIBLE: "The budget can stretch",
                }}
                onChange={(budgetFirmness) => setFact({ budgetFirmness })}
              />
            </Question>
            <Question asks="How firm are the dates?">
              <FirmnessChoice
                name="dates-firmness"
                value={facts.datesFirmness}
                words={{
                  FIXED: "The dates are fixed",
                  FLEXIBLE: "The dates can move",
                }}
                onChange={(datesFirmness) => setFact({ datesFirmness })}
              />
            </Question>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-[17px] text-ink/80">
              I have filled in what I remember. Changing an answer here affects
              only this trip.
            </p>
            {brief.style.map((answer) => {
              const changed = style[answer.topic];
              return (
                <Question
                  key={answer.topic}
                  asks={answer.asks}
                  note={
                    changed || answer.from === "trip"
                      ? "For this trip."
                      : answer.from === "profile"
                        ? `What I remember (${answer.source}).`
                        : `If you leave this: ${answer.assumes}`
                  }
                >
                  <Chips
                    options={answer.choices}
                    selected={changed ?? answer.values}
                    onToggle={(value) =>
                      setStyle((current) => ({
                        ...current,
                        [answer.topic]: toggleStyle(
                          answer,
                          current[answer.topic] ?? answer.values,
                          value,
                        ),
                      }))
                    }
                  />
                  {answer.topic === "food" && (
                    <p className={`${aside} mt-3`}>
                      Dietary rules and allergies on your profile hold for every
                      trip; a trip can add to them.
                      {brief.allergies.length > 0 &&
                        ` Allergies I respect: ${brief.allergies.join(", ")}.`}{" "}
                      <Link href="/profile" className={quiet}>
                        Open your profile
                      </Link>
                    </p>
                  )}
                </Question>
              );
            })}
          </>
        )}

        {step === 4 && (
          <>
            <div className="space-y-3">
              {brief.review.map((part) => (
                <section key={part.step} className={sheet}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className={eyebrow}>{part.title}</h2>
                    <button
                      type="button"
                      className={quiet}
                      onClick={() => go(part.step - 1)}
                    >
                      Edit<span className="sr-only"> {part.title}</span>
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1 text-[15.5px]">
                    {part.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <div>
              <label htmlFor="brief-said" className={legend}>
                Anything else I should know?
              </label>
              <p className={aside}>
                I show you how I understood it before I use any of it.
              </p>
              <textarea
                id="brief-said"
                rows={3}
                maxLength={600}
                value={said}
                onChange={(event) => setSaid(event.target.value)}
                className={`${field} mt-3 block w-full text-[15px]`}
              />
              <button
                type="button"
                className={`${buttonSecond} mt-3`}
                disabled={busy || said.trim() === (brief.said?.text ?? "")}
                onClick={save}
              >
                Show me how you understood it
              </button>

              {brief.said && (
                <div data-qa="brief-said" className="mt-5 space-y-4">
                  {brief.said.understood.length > 0 && (
                    <div>
                      <p className={eyebrow}>How I understood it</p>
                      <ul className="mt-2 space-y-2">
                        {brief.said.understood.map((item) => (
                          <li
                            key={`${item.topic}-${item.value}`}
                            className={`${sheet} flex flex-wrap items-center justify-between gap-x-4 gap-y-1`}
                          >
                            <span className="text-[15.5px]">
                              {item.name}: {item.label}
                            </span>
                            {item.inUse ? (
                              <span className="font-sans text-[13px] text-muted">
                                In use for this trip
                              </span>
                            ) : (
                              <button
                                type="button"
                                className={quiet}
                                disabled={busy}
                                onClick={() => {
                                  const answer = brief.style.find(
                                    (entry) => entry.topic === item.topic,
                                  );
                                  if (!answer) return;
                                  send({
                                    style: {
                                      [item.topic]: toggleStyle(
                                        answer,
                                        answer.values,
                                        item.value,
                                      ),
                                    },
                                  });
                                }}
                              >
                                Use this
                                <span className="sr-only">
                                  {" "}
                                  for {item.name}: {item.label}
                                </span>
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {brief.said.unused.length > 0 && (
                    <div>
                      <p className={eyebrow}>Kept as you said it</p>
                      <p className={aside}>
                        I could not turn this into an answer, so it does not
                        affect suggestions yet.
                      </p>
                      <ul className="mt-2 space-y-1 text-[15.5px]">
                        {brief.said.unused.map((sentence) => (
                          <li key={sentence}>“{sentence}”</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {brief.said.allergies.length > 0 && (
                    <p className="text-[15.5px]">
                      An allergy holds for every trip, so it belongs on your
                      profile: {brief.said.allergies.join(", ")}.{" "}
                      <Link href="/profile" className={quiet}>
                        Add it to your profile
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <p
        role="status"
        className="mt-6 min-h-5 font-sans text-[14px] text-stamp"
      >
        {failure}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
        {step > 0 && (
          <button
            type="button"
            className={quietLarge}
            disabled={busy}
            onClick={() => go(step - 1)}
          >
            Back
          </button>
        )}
        {step < last ? (
          <button
            type="button"
            className={buttonLarge}
            disabled={busy}
            onClick={() => go(step + 1)}
          >
            {busy ? "Saving…" : "Next"}
          </button>
        ) : (
          <button
            type="button"
            className={buttonLarge}
            disabled={busy}
            onClick={buildTrip}
          >
            {busy ? "Building day 1…" : "Build my trip"}
          </button>
        )}
        <button
          type="button"
          className={`${quietLarge} ml-auto`}
          disabled={busy}
          onClick={talkInstead}
        >
          Talk it through instead
        </button>
      </div>
    </div>
  );
}
