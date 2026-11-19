import { describe, expect, it } from "vitest";
import {
  getAuthRouteDecision,
  getSessionUserId,
  getTokenUserId,
} from "./auth-policy";

describe("auth route policy", () => {
  it("redirects signed-in users away from login", () => {
    expect(
      getAuthRouteDecision("/login", true, "http://localhost:3000/login"),
    ).toEqual({
      kind: "redirect",
      destination: "/home",
    });
  });

  it("redirects signed-out users from protected pages to login", () => {
    expect(
      getAuthRouteDecision(
        "/home",
        false,
        "http://localhost:3000/home",
      ),
    ).toEqual({
      kind: "redirect",
      destination:
        "http://localhost:3000/login?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2Fhome",
    });
  });

  it("returns API unauthorized for signed-out protected APIs", () => {
    expect(
      getAuthRouteDecision(
        "/api/v1/profile",
        false,
        "http://localhost:3000/api/recommendations",
      ),
    ).toEqual({
      kind: "api-unauthorized",
    });
  });

  it("allows public and signed-in protected routes", () => {
    expect(
      getAuthRouteDecision("/", false, "http://localhost:3000/"),
    ).toEqual({ kind: "allow" });
    expect(
      getAuthRouteDecision("/profile", true, "http://localhost:3000/profile"),
    ).toEqual({ kind: "allow" });
  });
});

describe("auth session policy", () => {
  it("reads user ids from Auth.js user and token objects", () => {
    expect(getTokenUserId({ id: "user_1" })).toBe("user_1");
    expect(getTokenUserId({})).toBeNull();
    expect(getSessionUserId({ id: "user_1" })).toBe("user_1");
    expect(getSessionUserId({ id: 123 })).toBeNull();
  });
});
