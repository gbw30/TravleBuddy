import { encode } from "@auth/core/jwt";

export type QaStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

export type QaSessionUser = {
  id: string;
  name: string;
  email: string;
};

export function sessionCookieName(baseUrl: URL) {
  return `${baseUrl.protocol === "https:" ? "__Secure-" : ""}authjs.session-token`;
}

export async function createQaStorageState(input: {
  baseUrl: URL;
  secret: string;
  user: QaSessionUser;
  maxAgeSeconds?: number;
}): Promise<QaStorageState> {
  const cookieName = sessionCookieName(input.baseUrl);
  const maxAge = input.maxAgeSeconds ?? 60 * 60;
  const value = await encode({
    secret: input.secret,
    salt: cookieName,
    maxAge,
    token: {
      id: input.user.id,
      sub: input.user.id,
      name: input.user.name,
      email: input.user.email,
    },
  });

  return {
    cookies: [
      {
        name: cookieName,
        value,
        domain: input.baseUrl.hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + maxAge,
        httpOnly: true,
        secure: input.baseUrl.protocol === "https:",
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
}

export function createQaStorageStateFromSessionCookie(input: {
  baseUrl: URL;
  cookieValue: string;
  expiresAt?: Date;
}): QaStorageState {
  if (!input.cookieValue.trim()) {
    throw new Error("The synthetic production session cookie cannot be empty.");
  }

  return {
    cookies: [
      {
        name: sessionCookieName(input.baseUrl),
        value: input.cookieValue,
        domain: input.baseUrl.hostname,
        path: "/",
        expires: Math.floor(
          (input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000)).getTime() /
            1000,
        ),
        httpOnly: true,
        secure: input.baseUrl.protocol === "https:",
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
}
