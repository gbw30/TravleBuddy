// The Conversation service's server interface: the script, the rule-based
// reader and the AI model boundary. Shapes live in `./contracts`, which browser
// code imports directly.
export {
  costUsd,
  monthlyCapUsd,
  underCap,
  usageMonth,
  type TokenUsage,
} from "./model/budget";
export { aiMode, modelCall, type ModelCall } from "./model/mode";
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
