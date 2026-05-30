import { afterEach, describe, expect, it, vi } from "vitest";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@example.com:5432/app?sslmode=require",
  DIRECT_URL: "postgresql://user:pass@example.com:5432/app?sslmode=require",
  AUTH_SECRET: "a".repeat(32),
  AUTH_GOOGLE_ID: "google-client-id",
  AUTH_GOOGLE_SECRET: "google-client-secret",
};

describe("server environment validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadValidator() {
    vi.resetModules();

    for (const [key, value] of Object.entries(validEnv)) {
      vi.stubEnv(key, value);
    }

    const { validateServerEnv } = await import("./env");
    return validateServerEnv;
  }

  it("does not require AUTH_URL because Auth.js can infer the deployment host", async () => {
    const validateServerEnv = await loadValidator();

    expect(validateServerEnv(validEnv)).toMatchObject({
      AUTH_URL: undefined,
      DATABASE_URL: validEnv.DATABASE_URL,
    });
  });

  it("accepts an explicit Auth.js redirect proxy URL for preview OAuth flows", async () => {
    const validateServerEnv = await loadValidator();

    expect(
      validateServerEnv({
        ...validEnv,
        AUTH_REDIRECT_PROXY_URL: "https://travlebuddy.example.com/api/auth",
      }),
    ).toMatchObject({
      AUTH_REDIRECT_PROXY_URL: "https://travlebuddy.example.com/api/auth",
    });
  });
});
