// The Memory service interface: the trip profile and the rules of memory. Browser code imports
// ./contracts instead. The folders `profile` and `preferences` belong to the
// earlier screens and go when Milestone 6 replaces them.
export { readTripTaste, saveTripAnswer } from "./trip-profile-store";
export {
  conflicts,
  learnedEntries,
  limitsInUse,
  tasteInUse,
  type Forgotten,
  type TasteInUse,
  type TripEvidence,
} from "./profile-rules";
