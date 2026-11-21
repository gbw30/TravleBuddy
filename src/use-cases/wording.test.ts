import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  computed,
  fixedSentence,
  sentence,
  type Sentence,
} from "@/lib/wording";

const mocks = vi.hoisted(() => ({
  modelCall: vi.fn(),
  wordingMode: vi.fn(),
  readUsage: vi.fn(),
  addUsage: vi.fn(),
  aiShareLeft: vi.fn(),
  addAiSpend: vi.fn(),
  readWordings: vi.fn(),
  recordWordings: vi.fn(),
  underCap: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { name: "db" } }));
vi.mock("@/features/fair-use", () => ({
  aiShareLeft: mocks.aiShareLeft,
  addAiSpend: mocks.addAiSpend,
}));
vi.mock("@/features/conversation", async (actual) => ({
  ...(await actual<typeof import("@/features/conversation")>()),
  modelCall: mocks.modelCall,
  wordingMode: mocks.wordingMode,
  readUsage: mocks.readUsage,
  addUsage: mocks.addUsage,
  underCap: mocks.underCap,
  readWordings: mocks.readWordings,
  recordWordings: mocks.recordWordings,
}));

import { shownWords } from "./wording";

const reasons = (n: number): { subject: string; sentences: Sentence[] }[] =>
  Array.from({ length: n }, (_, i) => ({
    subject: `card:s1:p${i}`,
    sentences: [
      sentence("slot-city", "It fits your {slot} in {city}.", [
        computed("slot", "lunch", "slot-word"),
        computed("city", "Lisbon", "slot-city"),
      ]),
    ],
  }));

/** A model that words every sentence the same way. */
const worded = (version: string) =>
  vi.fn(async (request: { messages: { content: string }[] }) => {
    const { texts } = JSON.parse(request.messages[0].content) as {
      texts: string[][];
    };
    return {
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            versions: texts.map((text) => text.map(() => version)),
          }),
        },
      ],
      usage: { input_tokens: 400, output_tokens: 40 },
    };
  });

const rowsRecorded = () => mocks.recordWordings.mock.calls[0][2];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.wordingMode.mockReturnValue("on");
  mocks.underCap.mockReturnValue(true);
  mocks.aiShareLeft.mockResolvedValue(true);
  mocks.readUsage.mockResolvedValue({ inputTokens: 0, outputTokens: 0 });
  mocks.readWordings.mockResolvedValue([]);
});

describe("shownWords with wording", () => {
  it("shows the template with fallback off when wording is off", async () => {
    mocks.wordingMode.mockReturnValue("off");
    const shown = await shownWords("t1", reasons(1), { word: true });
    expect(shown).toEqual(["It fits your lunch in Lisbon."]);
    expect(rowsRecorded()[0]).toMatchObject({
      wordedBy: "template",
      fallback: "off",
    });
  });

  it("shows the template with fallback cap at the cap or without a share", async () => {
    const call = worded("x");
    mocks.modelCall.mockReturnValue(call);
    mocks.underCap.mockReturnValue(false);
    await shownWords("t1", reasons(1), { word: true });
    expect(rowsRecorded()[0].fallback).toBe("cap");

    mocks.recordWordings.mockClear();
    mocks.underCap.mockReturnValue(true);
    mocks.aiShareLeft.mockResolvedValue(false);
    await shownWords("t1", reasons(1), { word: true });
    expect(rowsRecorded()[0].fallback).toBe("cap");
    expect(call).not.toHaveBeenCalled();
  });

  it("records a model row for an accepted version, counts the usage, and takes one call for three reasons", async () => {
    const call = worded("It suits your {slot} in {city}.");
    mocks.modelCall.mockReturnValue(call);
    const shown = await shownWords("t1", reasons(3), { word: true });
    expect(call).toHaveBeenCalledTimes(1);
    expect(shown).toEqual(Array(3).fill("It suits your lunch in Lisbon."));
    expect(rowsRecorded()).toHaveLength(3);
    expect(rowsRecorded()[0]).toMatchObject({
      wordedBy: "model",
      fallback: null,
      inputTokens: 400,
      outputTokens: 40,
    });
    expect(mocks.addUsage).toHaveBeenCalledTimes(1);
    expect(mocks.addAiSpend).toHaveBeenCalledTimes(1);
  });

  it("shows the template, naming the check, for a rejected version, and does not pay for it twice", async () => {
    mocks.modelCall.mockReturnValue(
      worded("A quiet fit for your {slot} in {city}."),
    );
    const shown = await shownWords("t1", reasons(1), { word: true });
    expect(shown).toEqual(["It fits your lunch in Lisbon."]);
    expect(rowsRecorded()[0]).toMatchObject({
      wordedBy: "template",
      fallback: "claim",
    });

    const call = worded("x");
    mocks.modelCall.mockReturnValue(call);
    mocks.readWordings.mockResolvedValue([{ ...rowsRecorded()[0] }]);
    await shownWords("t1", reasons(1), { word: true });
    expect(call).not.toHaveBeenCalled();
  });

  it("reuses an accepted model row with no second call", async () => {
    const call = worded("It suits your {slot} in {city}.");
    mocks.modelCall.mockReturnValue(call);
    const items = reasons(1);
    await shownWords("t1", items, { word: true });
    const [row] = rowsRecorded();
    mocks.recordWordings.mockClear();
    mocks.readWordings.mockResolvedValue([
      { ...row, wordedBy: "model", shown: "Reworded." },
    ]);
    expect(await shownWords("t1", items, { word: true })).toEqual([
      "Reworded.",
    ]);
    expect(mocks.recordWordings).not.toHaveBeenCalled();
  });

  it("shows the template within the budget when the call is too slow, and the next read calls again", async () => {
    const slow = vi.fn(() => new Promise(() => {}));
    mocks.modelCall.mockReturnValue(slow);
    const started = Date.now();
    const shown = await shownWords("t1", reasons(1), { word: true });
    expect(Date.now() - started).toBeLessThan(2600);
    expect(shown).toEqual(["It fits your lunch in Lisbon."]);
    expect(rowsRecorded()[0].fallback).toBe("timeout");

    mocks.readWordings.mockResolvedValue([{ ...rowsRecorded()[0] }]);
    await shownWords("t1", reasons(1), { word: true });
    expect(slow).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("keeps a caution word for word and sends only the other sentences", async () => {
    const caution = "Its opening hours are not known, so check before you go.";
    const items = [
      {
        subject: "card:s1:p0",
        sentences: [
          reasons(1)[0].sentences[0],
          fixedSentence("hours-unknown", caution),
        ],
      },
    ];
    const call = worded("It suits your {slot} in {city}.");
    mocks.modelCall.mockReturnValue(call);
    const shown = await shownWords("t1", items, { word: true });
    expect(shown).toEqual([`It suits your lunch in Lisbon. ${caution}`]);
    const sent = JSON.parse(call.mock.calls[0][0].messages[0].content);
    expect(sent.texts).toEqual([["It fits your {slot} in {city}."]]);
    expect(rowsRecorded()[0]).toMatchObject({ wordedBy: "model" });
  });

  it("makes no call for a reason of cautions only", async () => {
    const call = worded("x");
    mocks.modelCall.mockReturnValue(call);
    const items = [
      {
        subject: "card:s1:p0",
        sentences: [fixedSentence("hours-unknown", "Check before you go.")],
      },
    ];
    expect(await shownWords("t1", items, { word: true })).toEqual([
      "Check before you go.",
    ]);
    expect(call).not.toHaveBeenCalled();
    expect(rowsRecorded()[0].fallback).toBe("fixed");
  });

  it("records template rows with fallback off when wording is not asked for", async () => {
    mocks.modelCall.mockReturnValue(worded("x"));
    await shownWords("t1", reasons(1));
    expect(rowsRecorded()[0].fallback).toBe("off");
    expect(mocks.readWordings).not.toHaveBeenCalled();
  });
});
