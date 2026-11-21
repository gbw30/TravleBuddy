import {
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

// The three things a person is counted by (TB-SYS-16): the account, a signed
// device cookie and a hashed browser-and-network signature. The internet
// address alone never identifies anyone, and none of it is stored or logged.

export const DEVICE_COOKIE = "tb_device";

/** A key for one purpose, derived from AUTH_SECRET so the secret itself never signs anything here. */
function keyFor(secret: string, purpose: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", secret, "", `travlebuddy fair use: ${purpose}`, 32),
  );
}

const mac = (secret: string, id: string) =>
  createHmac("sha256", keyFor(secret, "device cookie"))
    .update(id)
    .digest("base64url");

/** A new device: a random id and the cookie value that carries it with its signature. */
export function deviceCookie(secret: string): { id: string; value: string } {
  const id = randomBytes(16).toString("base64url");
  return { id, value: `${id}.${mac(secret, id)}` };
}

/** The device id from a Cookie header, or null when it is missing or its signature does not hold. */
export function readDevice(
  cookieHeader: string | null,
  secret: string,
): string | null {
  const found = cookieHeader?.match(
    new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([\\w-]{22})\\.([\\w-]{43})(?:;|$)`),
  );
  if (!found) return null;
  const [, id, given] = found;
  const expected = Buffer.from(mac(secret, id));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual)
    ? id
    : null;
}

/**
 * The client's address, read only from the header Vercel sets
 * (`x-vercel-forwarded-for`). Off Vercel no header is trusted, because the
 * client could have written it.
 */
export function clientAddress(
  headers: Headers,
  onVercel: boolean,
): string | null {
  if (!onVercel) return null;
  return headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || null;
}

/** The coarse network an address belongs to: its /24 for IPv4, its /48 for IPv6. */
export function networkBlock(address: string | null): string {
  if (!address) return "";
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const v4 = mapped ?? address;
  if (isIPv4(v4)) return `${v4.split(".").slice(0, 3).join(".")}.0/24`;
  if (!isIPv6(address)) return "";
  const [head, tail] = address.split("::");
  const front = head ? head.split(":") : [];
  const groups =
    tail === undefined
      ? front
      : [...front, ...Array(Math.max(0, 8 - front.length)).fill("0")];
  const first = groups
    .slice(0, 3)
    .map((group) => parseInt(group, 16).toString(16));
  return `${first.join(":")}::/48`;
}

/**
 * An HMAC of the user agent, the accepted languages and the network block,
 * under a key that changes every UTC day, so a signature cannot be followed
 * from one day to the next.
 */
export function signature(
  headers: Headers,
  secret: string,
  now: Date,
  onVercel: boolean,
): string {
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", keyFor(secret, `signature ${day}`))
    .update(
      [
        headers.get("user-agent") ?? "",
        headers.get("accept-language") ?? "",
        networkBlock(clientAddress(headers, onVercel)),
      ].join("\n"),
    )
    .digest("hex")
    .slice(0, 32);
}
