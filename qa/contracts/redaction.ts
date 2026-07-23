const secretKeyPattern =
  /(?:^|_)(?:secret|password|passwd|token|authorization|cookie|api_key|database_url|private_key)(?:$|_)/i;

const sensitiveStringPatterns: ReadonlyArray<[
  RegExp,
  string | ((substring: string, ...args: string[]) => string),
]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
  [
    /\b(postgres(?:ql)?):\/\/[^\s/@:]+:[^\s/@]+@/gi,
    (_match, scheme: string) => `${scheme}://[REDACTED]@`,
  ],
  [
    /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_-]{12,})\b/g,
    "[REDACTED]",
  ],
  [/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]"],
];

export function redactString(
  value: string,
  explicitSecrets: readonly string[] = [],
): string {
  let redacted = value;

  for (const secret of explicitSecrets) {
    if (secret.length > 0) {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
  }

  for (const [pattern, replacement] of sensitiveStringPatterns) {
    redacted =
      typeof replacement === "string"
        ? redacted.replace(pattern, replacement)
        : redacted.replace(pattern, replacement);
  }

  return redacted;
}

export function redactSecrets(
  value: unknown,
  explicitSecrets: readonly string[] = [],
): unknown {
  if (typeof value === "string") {
    return redactString(value, explicitSecrets);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, explicitSecrets));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        const normalizedKey = key
          .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
          .replace(/[-.]/g, "_");
        return [
          key,
          secretKeyPattern.test(normalizedKey)
            ? "[REDACTED]"
            : redactSecrets(nestedValue, explicitSecrets),
        ];
      }),
    );
  }

  return value;
}
