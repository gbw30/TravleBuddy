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
    expect(isProtectedPageRoute("/home")).toBe(true);
    expect(isProtectedPageRoute("/home/settings")).toBe(true);
    expect(isProtectedPageRoute("/profile")).toBe(true);
    expect(isProtectedPageRoute("/trips/new")).toBe(true);
    expect(isProtectedPageRoute("/")).toBe(false);
  });

  it("identifies protected API routes", () => {
    expect(isProtectedApiRoute("/api/v1")).toBe(true);
    expect(isProtectedApiRoute("/api/v1/trips/trip_1")).toBe(true);
    expect(isProtectedApiRoute("/api/v1/profile")).toBe(true);
    expect(isProtectedApiRoute("/api/auth/session")).toBe(false);
    // The earlier planner's routes are gone; nothing there is guarded or served.
    expect(isProtectedApiRoute("/api/trips")).toBe(false);
  });

  it("combines protected page and API routes", () => {
    expect(isProtectedRoute("/profile")).toBe(true);
    expect(isProtectedRoute("/api/v1/profile")).toBe(true);
    expect(isProtectedRoute("/login")).toBe(false);
  });
});
