// The Memory service interface: the personal profile, the trip profile and
// the rules of memory. Browser code imports
// ./contracts instead. The folders `profile` and `preferences` belong to the
// earlier screens and go when Milestone 6 replaces them.
export { readTripTaste, saveTripAnswer } from "./trip-profile-store";
export {
  conflicts,
  learnedEntries,
  limitsInUse,
  rememberedFor,
  tasteInUse,
  type Forgotten,
  type TasteInUse,
  type TripEvidence,
} from "./profile-rules";
export {
  addNote,
  deleteEntry,
  deleteNote,
  readForgotten,
  readProfile,
  readProfileHistory,
  replaceLearned,
  resetProfile,
  saveStated,
  type Cause,
  type HistoryLine,
  type Profile,
  type SavedEntry,
  type SavedNote,
} from "./profile-store";
