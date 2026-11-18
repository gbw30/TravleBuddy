"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  ConversationMessage,
  ConversationSnapshot,
  Turn,
  TurnResult,
} from "@/features/conversation/contracts";
import { changeTrip } from "@/lib/trip-api";

import { AgentMessage } from "./agent-message";
import { button, chip, eyebrow, fieldLarge, quiet } from "./styles";

/** How far a thread goes: message ids only go up. */
const newest = (conversation: ConversationSnapshot) =>
  Number(conversation.messages.at(-1)?.id ?? 0);

/** One saved message, small, for the thread of what was said earlier. */
function Line({ message }: { message: ConversationMessage }) {
  const { body } = message;
  if (message.from === "traveller") {
    return (
      <li className="ml-auto max-w-[85%] rounded-2xl bg-tint px-4 py-2 font-sans text-[14px] [overflow-wrap:anywhere]">
        <span className="sr-only">You: </span>
        {body.text}
      </li>
    );
  }
  return (
    <li className="max-w-[85%] font-serif text-[16.5px] leading-[1.45] text-ink/80 italic">
      <span className="sr-only">TravleBuddy: </span>
      {body.text}
      {body.kind === "proposal" && body.placeNames.length > 0 && (
        <span className="mt-0.5 block font-sans text-[13px] text-muted not-italic">
          {body.placeNames.join(" · ")}
        </span>
      )}
    </li>
  );
}

/**
 * The guided conversation (PRD 7): the agent's question with its choices to
 * tap, a box to type in, and a skip. The server holds the thread; every turn
 * goes to it and the conversation it answers is shown.
 */
export function TripConversation({
  tripId,
  revision,
  initial,
  readOnly,
}: {
  tripId: string;
  revision: number;
  initial: ConversationSnapshot;
  readOnly: boolean;
}) {
  const router = useRouter();
  // The conversation as the last turn answered it. The page's own copy is
  // shown instead once it is at least as new: a page reload that started
  // before a later turn must not put an older thread back on screen.
  const [answered, setAnswered] = useState<ConversationSnapshot | null>(null);
  // The choices ticked so far, for the question they belong to.
  const [ticked, setTicked] = useState<{ topic: string; values: string[] }>({
    topic: "",
    values: [],
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const question = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null | undefined>(undefined);

  const { messages, waiting, limited } =
    answered && newest(answered) > newest(initial) ? answered : initial;
  const topic = waiting?.topic ?? null;
  const chosen = ticked.topic === topic ? ticked.values : [];

  // After an answer the next question takes the keyboard focus, so a
  // keyboard or screen-reader user is not left on a button that is gone.
  useEffect(() => {
    if (asked.current !== undefined && asked.current !== topic) {
      question.current?.focus();
    }
    asked.current = topic;
  }, [topic]);

  async function take(turn: Turn): Promise<boolean> {
    setBusy(true);
    setProblem(null);
    const result = await changeTrip<
      TurnResult & { conversation: ConversationSnapshot }
    >(tripId, revision, "POST", { turn }, "/conversation");
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      // A stale screen, or a question that moved on, is brought up to date.
      if (result.error === "stale_revision" || result.error === "refused") {
        router.refresh();
      }
      return false;
    }
    setAnswered(result.data.conversation);
    // A day the traveller named becomes the slot the workspace shows. After
    // any other change the facts, what is decided and the plan are read
    // again; a message that changed nothing leaves the page as it is.
    if (result.data.focus) {
      router.replace(`?slot=${result.data.focus}`, { scroll: false });
    } else if (result.data.changed) {
      router.refresh();
    }
    return true;
  }

  async function say(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Kept now: the event no longer names the form once the request returns.
    const form = event.currentTarget;
    const text = String(new FormData(form).get("say") ?? "").trim();
    if (text && (await take({ type: "say", text }))) form.reset();
  }

  // The agent's reply to the last thing said stays in view. A proposal made
  // after it is in the thread, and its cards are in the workspace below.
  const reply = messages.findLast(
    (message) => message.from === "agent" && message.body.kind === "text",
  );
  const several = waiting?.form === "pick_several";
  // Without the model a typed message is read only as an answer to a question.
  const canType = !readOnly && (waiting !== null || !limited);

  return (
    <section
      data-qa="trip-conversation"
      aria-label="The conversation"
      className="max-w-[620px] space-y-5"
    >
      <p className={eyebrow}>Planning together</p>

      {limited && !readOnly && (
        <p data-qa="limited-mode" className="font-sans text-[14px] text-muted">
          I am in a limited mode right now: I can read the choices you tap and
          simple typed answers.
        </p>
      )}

      {messages.length > 0 && (
        <details className="group">
          <summary className={`${quiet} cursor-pointer`}>
            The conversation so far ({messages.length})
          </summary>
          {/* A region that scrolls must be reachable by keyboard. */}
          <ol
            tabIndex={0}
            aria-label="The conversation so far"
            className="mt-3 flex max-h-[420px] flex-col gap-2.5 overflow-y-auto rounded-2xl bg-card p-4 shadow-sheet"
          >
            {messages.map((message) => (
              <Line key={message.id} message={message} />
            ))}
          </ol>
        </details>
      )}

      <div aria-live="polite" className="space-y-3">
        {messages.length === 0 && !readOnly && (
          <AgentMessage>
            Let’s plan this together. I will ask a few questions: tap an answer,
            type one, or skip.
          </AgentMessage>
        )}
        {reply && <AgentMessage>{reply.body.text}</AgentMessage>}
        {busy && (
          <p className="font-sans text-[14px] text-muted">One moment…</p>
        )}
      </div>

      {!readOnly && (
        <div ref={question} tabIndex={-1} className="space-y-3 outline-none">
          {waiting ? (
            <fieldset disabled={busy} className="space-y-3">
              <legend>
                <AgentMessage>{waiting.prompt}</AgentMessage>
              </legend>
              {waiting.choices.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {waiting.choices.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      className={chip}
                      aria-pressed={
                        several ? chosen.includes(choice.value) : undefined
                      }
                      onClick={() =>
                        several
                          ? setTicked({
                              topic: waiting.topic,
                              values: chosen.includes(choice.value)
                                ? chosen.filter((v) => v !== choice.value)
                                : [...chosen, choice.value],
                            })
                          : void take({
                              type: "answer",
                              topic: waiting.topic,
                              values: [choice.value],
                            })
                      }
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              )}
              {several && (
                <button
                  type="button"
                  className={button}
                  disabled={chosen.length === 0}
                  onClick={() =>
                    void take({
                      type: "answer",
                      topic: waiting.topic,
                      values: chosen,
                    })
                  }
                >
                  That is my answer
                </button>
              )}
            </fieldset>
          ) : (
            messages.length > 0 && (
              <AgentMessage>
                That is everything I needed to ask.{" "}
                {limited
                  ? "Pick places below, and change anything in the facts."
                  : "Tell me anything else here, or pick places below."}
              </AgentMessage>
            )
          )}

          {canType && (
            <form onSubmit={say} className="flex flex-wrap items-end gap-2.5">
              <label className="min-w-0 flex-1 basis-64">
                <span className="font-sans text-[13px] text-muted">
                  {waiting ? "Or type your answer" : "Type a message"}
                </span>
                <input
                  name="say"
                  maxLength={600}
                  autoComplete="off"
                  disabled={busy}
                  className={`${fieldLarge} mt-1 block w-full`}
                />
              </label>
              <button type="submit" className={button} disabled={busy}>
                Send
              </button>
              {waiting && (
                <button
                  type="button"
                  className={quiet}
                  disabled={busy}
                  onClick={() =>
                    void take({ type: "skip", topic: waiting.topic })
                  }
                >
                  Skip this question
                </button>
              )}
            </form>
          )}
        </div>
      )}

      <p role="alert" className="font-sans text-[14px] text-stamp">
        {problem}
      </p>
    </section>
  );
}
