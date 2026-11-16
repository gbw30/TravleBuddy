export const CURRENCIES = [
  "JPY",
  "USD",
  "EUR",
  "GBP",
  "SGD",
  "AUD",
  "CAD",
  "CHF",
] as const;
export type Currency = (typeof CURRENCIES)[number];

/** How much of each currency one yen buys, and the day the rates are from. */
export type Rates = { date: string; perYen: Record<Currency, number> };

const RATES_URL = `https://api.frankfurter.dev/v1/latest?base=JPY&symbols=${CURRENCIES.filter((code) => code !== "JPY").join(",")}`;

/**
 * Checks a reply from the rate service. Anything missing or odd rejects the
 * whole reply: a wrong rate is worse than no conversion.
 */
export function parseRates(reply: unknown): Rates | null {
  if (typeof reply !== "object" || reply === null) return null;
  const { base, date, rates } = reply as Record<string, unknown>;
  if (base !== "JPY" || typeof date !== "string") return null;
  if (typeof rates !== "object" || rates === null) return null;

  const perYen = { JPY: 1 } as Record<Currency, number>;
  for (const code of CURRENCIES) {
    if (code === "JPY") continue;
    const rate = (rates as Record<string, unknown>)[code];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      return null;
    }
    perYen[code] = rate;
  }
  return { date, perYen };
}

/**
 * The European Central Bank's daily reference rates, by way of Frankfurter.
 * They change once each working day, so an hour's cache is current. Null when
 * the service cannot be reached; the profile then stays in yen.
 */
export async function getRates(): Promise<Rates | null> {
  try {
    const response = await fetch(RATES_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    return response.ok ? parseRates(await response.json()) : null;
  } catch {
    return null;
  }
}

/** A yen amount in another currency, to two figures: a budget is not exact. */
export function fromYen(yen: number, to: Currency, rates: Rates): number {
  if (to === "JPY") return yen;
  return Number((yen * rates.perYen[to]).toPrecision(2));
}

const formats = new Map<Currency, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: Currency): string {
  let format = formats.get(currency);
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    formats.set(currency, format);
  }
  return format.format(amount);
}

/** The daily-budget stops, written in the chosen currency. */
export function budgetStops(
  yenAmounts: number[],
  currency: Currency,
  rates: Rates | null,
): string[] {
  const shown = rates ? currency : "JPY";
  return yenAmounts.map((yen) =>
    formatMoney(rates ? fromYen(yen, shown, rates) : yen, shown),
  );
}
