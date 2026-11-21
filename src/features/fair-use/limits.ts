// Fair use (TB-SYS-16, TB-SYS-17), as the developer set it on 2026-11-20.
// Each value is the limit for one person: their account and their device are
// each held to it, and their signature to SIGNATURE_FACTOR times it.

/** Requests a minute. `api` counts every /api/v1 request; a route may add one other scope. */
export const REQUESTS_PER_MINUTE = {
  api: 60,
  /** Place gathering and cards. */
  places: 20,
  /** City and address lookups. */
  lookups: 10,
  /** Conversation turns and plan builds. */
  turns: 10,
  /** A device without sign-in: its cookie and its signature, never the internet address alone. */
  unsigned: 30,
} as const;
export type Scope = keyof typeof REQUESTS_PER_MINUTE;

/** Each person's share of a shared daily allowance, in provider requests a UTC day. */
export const DAILY_SHARES = { gather: 30, addresses: 20 } as const;
export type Share = keyof typeof DAILY_SHARES;

/** Each person's share of AI model spend a UTC day, within the monthly cap. */
export const AI_DAILY_SHARE_USD = 1;

/**
 * A signature stands for everyone using one browser build and language in one
 * network block, so it is allowed this many times a person's limit.
 */
export const SIGNATURE_FACTOR = 5;
