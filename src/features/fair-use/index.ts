// The Fair use service's interface (TB-SYS-16, TB-SYS-17): request limits a
// minute and daily shares, counted per person by account, device and signature.
export {
  addAiSpend,
  admit,
  aiShareLeft,
  asPerson,
  identify,
  withinShare,
  type Person,
} from "./counts";
export type { Scope } from "./limits";
