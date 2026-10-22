/**
 * Rate Limit Multiplier
 *
 * `RATE_LIMIT_MULTIPLIER` scales the ceiling of every request rate limiter in
 * one step: the Hono limiters in `server/rate-limit.ts` (page data, mobile API,
 * self-service pages, calendar feed, Sentry tunnel) and the per-user mobile
 * buckets in `~/utils/rate-limit.server`. An instance whose users share one
 * public IP (a station's Wi-Fi, a carrier NAT) raises it so they do not exhaust
 * a single per-IP budget between them.
 *
 * The wrong-PIN lockout for self-service custody is a separate counter and is
 * not scaled: it guards a secret, not capacity.
 *
 * @see {@link file://./../../server/rate-limit.ts}
 * @see {@link file://./rate-limit.server.ts}
 */
import { RATE_LIMIT_MULTIPLIER } from "./env";
import { Logger } from "./logger";

/** Multiplier used when the variable is unset or unusable: the stock limits. */
export const DEFAULT_RATE_LIMIT_MULTIPLIER = 1;

/**
 * Parses a `RATE_LIMIT_MULTIPLIER` value.
 *
 * Blank means "not configured" and is decided before conversion, so an empty
 * value never turns into a multiplier of 0 that would block every request.
 *
 * @param raw - The raw environment value
 * @returns A positive, finite multiplier; {@link DEFAULT_RATE_LIMIT_MULTIPLIER}
 *   when blank, and also when unusable (with a warning)
 */
export function parseRateLimitMultiplier(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_RATE_LIMIT_MULTIPLIER;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    Logger.warn(
      `RATE_LIMIT_MULTIPLIER "${raw}" is not a positive number; using ${DEFAULT_RATE_LIMIT_MULTIPLIER}.`
    );
    return DEFAULT_RATE_LIMIT_MULTIPLIER;
  }

  return value;
}

/** The multiplier this server runs with, read once at startup. */
const configuredMultiplier = parseRateLimitMultiplier(RATE_LIMIT_MULTIPLIER);

/**
 * Scales a limiter's stock ceiling by the configured multiplier.
 *
 * @param base - The stock limit (requests per window)
 * @param multiplier - Override for tests; defaults to `RATE_LIMIT_MULTIPLIER`
 * @returns The scaled limit, rounded and never below 1
 */
export function scaleRateLimit(
  base: number,
  multiplier: number = configuredMultiplier
): number {
  return Math.max(1, Math.round(base * multiplier));
}
