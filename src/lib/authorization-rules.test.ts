import { describe, expect, it } from "vitest";
import { buildTripOwnerWhere } from "./authorization-rules";

describe("authorization rules", () => {
  it("builds trip ownership queries with both trip id and user id", () => {
    expect(buildTripOwnerWhere("user_1", "trip_1")).toEqual({
      id: "trip_1",
      userId: "user_1",
    });
  });
});
