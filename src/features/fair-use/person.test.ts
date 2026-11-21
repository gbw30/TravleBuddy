import { describe, expect, it } from "vitest";

import {
  clientAddress,
  deviceCookie,
  networkBlock,
  readDevice,
  signature,
} from "./person";

const SECRET = "a-test-secret-that-is-long-enough-1234";
const DAY = new Date("2026-11-20T12:00:00Z");

describe("networkBlock", () => {
  it("keeps the /24 of an IPv4 address", () => {
    expect(networkBlock("192.0.2.77")).toBe("192.0.2.0/24");
  });

  it("keeps the /48 of an IPv6 address, written short or long", () => {
    expect(networkBlock("2001:db8:1234:5678::1")).toBe("2001:db8:1234::/48");
    expect(networkBlock("2001:DB8:0:0:0:0:0:1")).toBe("2001:db8:0::/48");
    expect(networkBlock("2001:db8::1")).toBe("2001:db8:0::/48");
  });

  it("reads an IPv4 address mapped into IPv6 as IPv4", () => {
    expect(networkBlock("::ffff:192.0.2.9")).toBe("192.0.2.0/24");
  });

  it("is empty for anything that is not an address", () => {
    expect(networkBlock(null)).toBe("");
    expect(networkBlock("not-an-address")).toBe("");
  });
});

describe("clientAddress", () => {
  const headers = new Headers({
    "x-vercel-forwarded-for": "192.0.2.1, 198.51.100.2",
    "x-forwarded-for": "203.0.113.5",
  });

  it("reads only the header Vercel sets, and its first entry", () => {
    expect(clientAddress(headers, true)).toBe("192.0.2.1");
  });

  it("trusts no header off Vercel, where a client could write any of them", () => {
    expect(clientAddress(headers, false)).toBeNull();
  });
});

describe("device cookie", () => {
  it("is read back when its signature holds", () => {
    const { id, value } = deviceCookie(SECRET);
    expect(readDevice(`other=1; tb_device=${value}`, SECRET)).toBe(id);
  });

  it("is refused with a changed id, a changed signature or another secret", () => {
    const { value } = deviceCookie(SECRET);
    const [id, mac] = value.split(".");
    const otherId = `${id.slice(0, -1)}${id.endsWith("A") ? "B" : "A"}`;
    expect(readDevice(`tb_device=${otherId}.${mac}`, SECRET)).toBeNull();
    expect(readDevice(`tb_device=${id}.${mac.slice(1)}x`, SECRET)).toBeNull();
    expect(
      readDevice(`tb_device=${value}`, `${SECRET}-other-secret`),
    ).toBeNull();
    expect(readDevice("tb_device=garbage", SECRET)).toBeNull();
    expect(readDevice(null, SECRET)).toBeNull();
  });

  it("holds a random id and its signature, nothing else", () => {
    const first = deviceCookie(SECRET);
    const second = deviceCookie(SECRET);
    expect(first.id).not.toBe(second.id);
    expect(first.value).toMatch(/^[\w-]{22}\.[\w-]{43}$/);
  });
});

describe("signature", () => {
  const browser = (address: string, ua = "Mozilla/5.0 Test") =>
    new Headers({
      "user-agent": ua,
      "accept-language": "en-GB,en;q=0.9",
      "x-vercel-forwarded-for": address,
    });

  it("is the same for one browser in one network block on one day", () => {
    expect(signature(browser("192.0.2.1"), SECRET, DAY, true)).toBe(
      signature(browser("192.0.2.200"), SECRET, DAY, true),
    );
  });

  it("differs for another block, another browser or another day", () => {
    const base = signature(browser("192.0.2.1"), SECRET, DAY, true);
    expect(signature(browser("198.51.100.1"), SECRET, DAY, true)).not.toBe(
      base,
    );
    expect(
      signature(browser("192.0.2.1", "Other/1.0"), SECRET, DAY, true),
    ).not.toBe(base);
    const nextDay = new Date("2026-11-21T00:00:00Z");
    expect(signature(browser("192.0.2.1"), SECRET, nextDay, true)).not.toBe(
      base,
    );
  });

  it("holds neither the address nor the user agent", () => {
    const value = signature(browser("192.0.2.1"), SECRET, DAY, true);
    expect(value).toMatch(/^[0-9a-f]{32}$/);
    expect(value).not.toContain("192");
  });
});
