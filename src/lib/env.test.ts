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

  it("accepts documented legacy aliases while returning Auth.js names", async () => {
    const validateServerEnv = await loadValidator();

    expect(
      validateServerEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
        NEXTAUTH_SECRET: validEnv.AUTH_SECRET,
        NEXTAUTH_URL: "http://127.0.0.1:3000",
        GOOGLE_CLIENT_ID: validEnv.AUTH_GOOGLE_ID,
        GOOGLE_CLIENT_SECRET: validEnv.AUTH_GOOGLE_SECRET,
      }),
    ).toMatchObject({
      AUTH_SECRET: validEnv.AUTH_SECRET,
      AUTH_URL: "http://127.0.0.1:3000",
      AUTH_GOOGLE_ID: validEnv.AUTH_GOOGLE_ID,
      AUTH_GOOGLE_SECRET: validEnv.AUTH_GOOGLE_SECRET,
    });
  });

  it("names missing startup requirements without exposing supplied values", async () => {
    const validateServerEnv = await loadValidator();
    const secret = "do-not-print-this-oauth-secret";

    expect(() =>
      validateServerEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
        AUTH_SECRET: validEnv.AUTH_SECRET,
        AUTH_GOOGLE_SECRET: secret,
      }),
    ).toThrow(/AUTH_GOOGLE_ID/);

    try {
      validateServerEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
        AUTH_SECRET: validEnv.AUTH_SECRET,
        AUTH_GOOGLE_SECRET: secret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("validates database-only runtime configuration without Auth.js", async () => {
    const { validateDatabaseEnv } = await import("./env");

    expect(
      validateDatabaseEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
      }),
    ).toEqual({
      DATABASE_URL: validEnv.DATABASE_URL,
      DIRECT_URL: undefined,
    });
  });

  it("validates worker and optional provider configuration without web secrets", async () => {
    const { validateWorkerEnv } = await import("./env");

    expect(
      validateWorkerEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
        NODE_ENV: "production",
        PLACE_PROVIDER_MODE: "google",
        GOOGLE_PLACES_API_KEY: "server-key",
        PLANNING_WORKER_ID: "worker-1",
      }),
    ).toMatchObject({
      DATABASE_URL: validEnv.DATABASE_URL,
      PLACE_PROVIDER_MODE: "google",
      PLANNING_WORKER_ID: "worker-1",
    });
  });
});
