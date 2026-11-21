import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { sentence } from "@/lib/wording";

import type { ModelCall } from "./mode";
import { wordSentences } from "./word";

const texts = [
  [sentence("a", "It fits your {slot}."), sentence("b", "Open all visit.")],
];
const reply = (text: string, over: Partial<Anthropic.Message> = {}) =>
  (async () =>
    ({
      stop_reason: "end_turn",
      content: [{ type: "text", text }],
      usage: { input_tokens: 300, output_tokens: 30 },
      ...over,
    }) as Anthropic.Message) as ModelCall;

describe("wordSentences", () => {
  it("returns the versions and the usage, and sends templates with their gaps", async () => {
    let sent = "";
    const call: ModelCall = async (request, options) => {
      sent = JSON.stringify(request.messages) + String(options?.signal);
      return reply(JSON.stringify({ versions: [["x {slot}.", "y"]] }))(request);
    };
    const out = await wordSentences(texts, call, new AbortController().signal);
    expect(out).toEqual({
      status: "worded",
      versions: [["x {slot}.", "y"]],
      usage: { inputTokens: 300, outputTokens: 30 },
    });
    expect(sent).toContain("It fits your {slot}.");
  });

  it("fails when the call is aborted, even if the call ignores the signal", async () => {
    const stuck: ModelCall = () => new Promise(() => {});
    const out = await wordSentences(texts, stuck, AbortSignal.abort());
    expect(out).toEqual({ status: "failed" });
  });

  it("discards a refusal, a reply of the wrong shape, and a call that throws is failed", async () => {
    const signal = new AbortController().signal;
    expect(
      (
        await wordSentences(
          texts,
          reply("{}", { stop_reason: "refusal" }),
          signal,
        )
      ).status,
    ).toBe("discarded");
    expect(
      (
        await wordSentences(
          texts,
          reply(JSON.stringify({ versions: [["only one"]] })),
          signal,
        )
      ).status,
    ).toBe("discarded");
    expect((await wordSentences(texts, reply("not json"), signal)).status).toBe(
      "discarded",
    );
    const broken: ModelCall = async () => {
      throw new Error("down");
    };
    expect((await wordSentences(texts, broken, signal)).status).toBe("failed");
  });
});
