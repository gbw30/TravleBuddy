// The Conversation service's server interface: the script, the saved
// conversation, the rule-based reader and the AI model boundary. Shapes live in `./contracts`, which browser
// code imports directly.
export {
  appendMessages,
  readConversation,
  readSkippedFacts,
  skipFact,
  type NewMessage,
} from "./conversation-store";
export {
  costUsd,
  monthlyCapUsd,
  underCap,
  usageMonth,
  type TokenUsage,
} from "./model/budget";
export { aiMode, modelCall, type ModelCall } from "./model/mode";
export { addUsage, readUsage } from "./model/usage-store";
export {
  MODEL,
  readTypedInput,
  type ModelReading,
  type TypedInput,
} from "./model/read-typed";
export { readAnswerByRule } from "./read-answer";
export {
  allowedValues,
  nextQuestion,
  QUESTIONS,
  readiness,
  TASTE_DEFAULTS,
  type Readiness,
  type ScriptState,
} from "./script";
