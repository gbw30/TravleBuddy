// The Trips service interface: trips, their facts, and fixed commitments.
// Browser code imports ./contracts instead.
export {
  addCommitment,
  removeCommitment,
  updateCommitment,
  type CommitmentsResult,
} from "./commitment-store";
export { factsFromTickets } from "./tickets";
export { findEditable, type Refused } from "./trip-access";
export { todayIn } from "./trip-state";
export {
  CitiesInUseError,
  createTrip,
  getTrip,
  listFinishedTrips,
  listTrips,
  removeTrip,
  renameTrip,
  saveTripFacts,
  setPlanFinished,
  setPlanningMode,
  setTripArchived,
  type NewTrip,
} from "./trip-store";
