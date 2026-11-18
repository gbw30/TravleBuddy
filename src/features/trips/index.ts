// The Trips service interface: trips, their facts, and fixed commitments.
// Browser code imports ./contracts instead. Files not exported here belong to
// the earlier screens and go when Milestones 4 to 6 replace them.
export {
  addCommitment,
  removeCommitment,
  updateCommitment,
  type CommitmentsResult,
} from "./commitment-store";
export { factsFromTickets } from "./tickets";
export type { Refused } from "./trip-access";
export {
  CitiesInUseError,
  createTrip,
  getTrip,
  listTrips,
  removeTrip,
  renameTrip,
  saveTripFacts,
  setPlanFinished,
  setTripArchived,
  type NewTrip,
} from "./trip-store";
