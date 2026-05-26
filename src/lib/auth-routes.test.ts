import { describe, expect, it } from "vitest";
import {
  isLoginRoute,
  isProtectedApiRoute,
  isProtectedPageRoute,
  isProtectedRoute,
} from "./auth-routes";

describe("auth route classification", () => {
  it("identifies the login route", () => {
    expect(isLoginRoute("/login")).toBe(true);
    expect(isLoginRoute("/login/help")).toBe(false);
  });

  it("identifies protected app pages", () => {
    expect(isProtectedPageRoute("/dashboard")).toBe(true);
    expect(isProtectedPageRoute("/dashboard/settings")).toBe(true);
    expect(isProtectedPageRoute("/profile")).toBe(true);
    expect(isProtectedPageRoute("/trips/new")).toBe(true);
    expect(isProtectedPageRoute("/")).toBe(false);
  });

  it("identifies protected API routes", () => {
    expect(isProtectedApiRoute("/api/recommendations")).toBe(true);
    expect(isProtectedApiRoute("/api/itinerary/build")).toBe(true);
    expect(isProtectedApiRoute("/api/export/json")).toBe(true);
    expect(isProtectedApiRoute("/api/auth/session")).toBe(false);
  });

  it("combines protected page and API routes", () => {
    expect(isProtectedRoute("/profile")).toBe(true);
    expect(isProtectedRoute("/api/export")).toBe(true);
    expect(isProtectedRoute("/login")).toBe(false);
  });
});
