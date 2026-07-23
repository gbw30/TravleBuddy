import { decode } from "@auth/core/jwt";
import { describe, expect, test } from "vitest";
import {
  createQaStorageState,
  createQaStorageStateFromSessionCookie,
  sessionCookieName,
} from "./session";

describe("QA Auth.js session state", () => {
  test("uses the Auth.js cookie name as the encryption salt", async () => {
    const baseUrl = new URL("https://qa.travlebuddy.test");
    const secret = "a-secure-test-secret-that-is-at-least-32-chars";
    const state = await createQaStorageState({
      baseUrl,
      secret,
      user: {
        id: "qa-user-1",
        name: "QA Owner",
        email: "qa-owner@travlebuddy.invalid",
      },
    });
    const cookie = state.cookies[0];
    const token = await decode({
      token: cookie.value,
      secret,
      salt: cookie.name,
    });

    expect(cookie.name).toBe("__Secure-authjs.session-token");
    expect(cookie.secure).toBe(true);
    expect(token).toMatchObject({ id: "qa-user-1", sub: "qa-user-1" });
  });

  test("uses an unprefixed cookie for local HTTP", () => {
    expect(sessionCookieName(new URL("http://127.0.0.1:3000"))).toBe(
      "authjs.session-token",
    );
  });

  test("uses a pre-provisioned encrypted cookie without requiring AUTH_SECRET", () => {
    const state = createQaStorageStateFromSessionCookie({
      baseUrl: new URL("https://travlebuddy.example"),
      cookieValue: "encrypted-synthetic-session",
    });

    expect(state.cookies[0]).toMatchObject({
      name: "__Secure-authjs.session-token",
      value: "encrypted-synthetic-session",
      secure: true,
    });
  });

  test("rejects an empty pre-provisioned production cookie", () => {
    expect(() =>
      createQaStorageStateFromSessionCookie({
        baseUrl: new URL("https://travlebuddy.example"),
        cookieValue: "   ",
      }),
    ).toThrow("cannot be empty");
  });
});
