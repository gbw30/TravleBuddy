export function buildTripOwnerWhere(userId: string, tripId: string) {
  return {
    id: tripId,
    userId,
  };
}
