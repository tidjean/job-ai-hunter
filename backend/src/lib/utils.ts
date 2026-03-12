import crypto from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashJobKey(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function truncate(value: string, max = 10000): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max)}...`;
}

export function compactText(...parts: Array<string | null | undefined>): string {
  return normalizeWhitespace(parts.filter(Boolean).join(" "));
}

export function tokenize(value: string): string[] {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9.+#-]+/i)
    .filter((token) => token.length > 2);
}
