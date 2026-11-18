import Anthropic from "@anthropic-ai/sdk";

// The switch in front of the AI model (TB-SYS-10). Everything that calls the
// model goes through `modelCall`, so with the model off nothing can reach it.

/** One request to the model. Tests pass a stand-in; nothing else builds one. */
export type ModelCall = (
  request: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

/** Off without a key, or when switched off. The monthly cap is checked by the caller. */
export function aiMode(env: NodeJS.ProcessEnv = process.env): "on" | "off" {
  return env.AI_MODE !== "off" && env.ANTHROPIC_API_KEY ? "on" : "off";
}

let client: Anthropic | undefined;

/** The way to call the model, or null when it is off. */
export function modelCall(): ModelCall | null {
  if (aiMode() === "off") return null;
  // A traveller is waiting on the reply: give up after ten seconds and one
  // retry, and let the conversation continue in its limited mode.
  client ??= new Anthropic({ timeout: 10_000, maxRetries: 1 });
  const { messages } = client;
  return (request) => messages.create(request);
}
