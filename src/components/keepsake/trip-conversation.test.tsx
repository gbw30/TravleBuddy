import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  ConversationMessage,
  ConversationSnapshot,
} from "@/features/conversation/contracts";
import { QUESTIONS } from "@/features/conversation/script";

import { TripConversation } from "./trip-conversation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

const message = (
  id: string,
  from: ConversationMessage["from"],
  body: ConversationMessage["body"],
): ConversationMessage => ({ id, from, body, at: "2026-11-19T08:00:00.000Z" });
const snapshot = (
  over: Partial<ConversationSnapshot> = {},
): ConversationSnapshot => ({
  messages: [],
  waiting: QUESTIONS.pace,
  needs: [],
  limited: false,
  ...over,
});
const render = (initial: ConversationSnapshot, readOnly = false) =>
  renderToStaticMarkup(
    <TripConversation
      tripId="trip-1"
      revision={3}
      initial={initial}
      readOnly={readOnly}
    />,
  );
const count = (html: string, part: string) => html.split(part).length - 1;

describe("TripConversation", () => {
  it("opens with a greeting and the first question, answerable by tapping, typing or skipping", () => {
    const html = render(snapshot());
    expect(html).toContain("plan this together");
    expect(html).toContain("How packed should the days be?");
    for (const label of ["Relaxed", "Balanced", "Packed"]) {
      expect(html).toContain(`>${label}</button>`);
    }
    expect(html).toContain('name="say"');
    expect(html).toContain("Or type your answer");
    expect(html).toContain("Skip this question");
    // One choice is enough, so there is nothing to confirm and nothing ticked.
    expect(html).not.toContain("That is my answer");
    expect(html).not.toContain('aria-pressed="');
  });

  it("offers a remembered answer with one tap, and the other choices beside it", () => {
    const html = render(
      snapshot({
        waiting: {
          ...QUESTIONS.pace,
          prompt:
            "Pace: from your trip “Lisbon” I remember relaxed. Same for this trip?",
          remembered: ["relaxed"],
        },
      }),
    );
    expect(html).toContain("I remember relaxed");
    expect(html).toContain(">Yes, same again</button>");
    expect(html).toContain("Or choose differently for this trip:");
    expect(html).toContain(">Packed</button>");
    expect(render(snapshot())).not.toContain("Yes, same again");
  });

  it("lets several choices be ticked before answering, and none is sent until one is", () => {
    const html = render(snapshot({ waiting: QUESTIONS.interests }));
    expect(count(html, 'aria-pressed="false"')).toBe(
      QUESTIONS.interests.choices.length,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>That is my answer/);
  });

  it("asks an open question with a box to type in and no choices", () => {
    const html = render(snapshot({ waiting: QUESTIONS.where }));
    expect(html).toContain("Where are you going?");
    expect(html).toContain('name="say"');
    expect(html).not.toContain("aria-pressed");
  });

  it("says when it is in a limited mode", () => {
    expect(render(snapshot({ limited: true }))).toContain(
      'data-qa="limited-mode"',
    );
    expect(render(snapshot())).not.toContain('data-qa="limited-mode"');
  });

  it("keeps the agent's reply in view when a proposal follows it, and the whole thread in order behind a disclosure", () => {
    const html = render(
      snapshot({
        waiting: QUESTIONS.day_shape,
        messages: [
          message("1", "agent", {
            kind: "question",
            topic: "pace",
            text: "How packed should the days be?",
          }),
          message("2", "traveller", { kind: "text", text: "Relaxed" }),
          message("3", "agent", { kind: "text", text: "Noted: relaxed." }),
          message("4", "agent", {
            kind: "proposal",
            slotId: "d1-morning",
            text: "For day 1, morning at 09:30, I suggest one of these.",
            placeNames: ["Senso-ji", "Ueno Park"],
          }),
        ],
      }),
    );
    expect(html).toContain("The conversation so far (4)");
    expect(html).toContain("Senso-ji · Ueno Park");
    expect(html.indexOf("How packed should the days be?")).toBeLessThan(
      html.indexOf("Relaxed"),
    );
    expect(html.indexOf("Relaxed")).toBeLessThan(html.indexOf("For day 1"));
    // The reply is in the thread and again, in full size, as what was last said.
    expect(count(html, "Noted: relaxed.")).toBe(2);
    expect(count(html, "For day 1, morning")).toBe(1);
    expect(html.lastIndexOf("Noted: relaxed.")).toBeGreaterThan(
      html.indexOf("For day 1, morning"),
    );
    expect(html).toContain("Early starts, or late nights?");
    expect(html).not.toContain("plan this together");
  });

  it("says when the questions are done, and takes free messages only when the model can read them", () => {
    const done = {
      waiting: null,
      messages: [message("1", "agent", { kind: "text", text: "Noted." })],
    };
    const open = render(snapshot(done));
    expect(open).toContain("That is everything I needed to ask.");
    expect(open).toContain("Type a message");
    expect(open).not.toContain("Skip this question");
    const limited = render(snapshot({ ...done, limited: true }));
    expect(limited).toContain("Pick places below");
    expect(limited).not.toContain('name="say"');
  });

  it("shows an archived trip's thread with nothing to answer", () => {
    const html = render(
      snapshot({
        waiting: null,
        limited: true,
        messages: [
          message("1", "traveller", { kind: "text", text: "Relaxed" }),
          message("2", "agent", { kind: "text", text: "Noted: relaxed." }),
        ],
      }),
      true,
    );
    expect(html).toContain("Noted: relaxed.");
    expect(html).toContain("The conversation so far (2)");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('data-qa="limited-mode"');
  });
});
