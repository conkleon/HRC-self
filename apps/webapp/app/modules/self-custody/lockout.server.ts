/**
 * Self-Service Custody PIN Lockout
 *
 * Slows down guessing of the workspace PIN on the public self-service page.
 * Two counters run side by side, each over a 15-minute window:
 * - per (workspace, client IP): 5 wrong PINs lock that client out;
 * - per workspace: 50 wrong PINs, from any number of IPs, lock self-service
 *   for the whole workspace.
 * A lock lasts 15 minutes from the failure that triggered it.
 *
 * Counters live in memory, so they reset on restart and are per process. The
 * self-hosted stack runs one app container, which makes that exact; a
 * multi-machine deployment would need a shared store behind the same API.
 *
 * @see {@link file://./../../routes/qr+/_public+/$qrId_.self-custody.tsx}
 */

/** Wrong PINs one client may enter before it is locked out. */
export const MAX_FAILURES_PER_CLIENT = 5;

/** Wrong PINs a workspace may receive before self-service locks for everyone. */
export const MAX_FAILURES_PER_ORG = 50;

/** Length of the counting window, and of a lock. */
export const LOCKOUT_WINDOW_MS = 15 * 60_000;

/**
 * Cap on tracked keys, so an attacker rotating IPs cannot grow the map
 * without bound. The oldest entry is dropped first.
 */
const MAX_TRACKED_KEYS = 10_000;

type Counter = {
  /** Failures in the current window. */
  count: number;
  /** Epoch ms of the first failure in the current window. */
  windowStart: number;
  /** Epoch ms until which the key is locked, 0 when not locked. */
  lockedUntil: number;
};

const counters = new Map<string, Counter>();

type LockoutKey = { organizationId: string; ip: string };

const clientKey = ({ organizationId, ip }: LockoutKey) =>
  `client:${organizationId}:${ip}`;
const orgKey = ({ organizationId }: LockoutKey) => `org:${organizationId}`;

/** Returns the live counter for a key, dropping it once its window and lock are over. */
function readCounter(key: string, now: number): Counter | undefined {
  const counter = counters.get(key);
  if (!counter) return undefined;

  const windowOver = now - counter.windowStart > LOCKOUT_WINDOW_MS;
  const lockOver = counter.lockedUntil <= now;
  if (windowOver && lockOver) {
    counters.delete(key);
    return undefined;
  }
  return counter;
}

/** Counts one failure against a key and locks it when it reaches `max`. */
function bump(key: string, max: number, now: number) {
  const counter = readCounter(key, now) ?? {
    count: 0,
    windowStart: now,
    lockedUntil: 0,
  };
  counter.count += 1;
  if (counter.count >= max) counter.lockedUntil = now + LOCKOUT_WINDOW_MS;

  // Delete-then-set keeps the map in last-touched order for eviction.
  counters.delete(key);
  counters.set(key, counter);
  while (counters.size > MAX_TRACKED_KEYS) {
    const oldest = counters.keys().next().value;
    if (oldest === undefined) break;
    counters.delete(oldest);
  }
}

/**
 * Whether this client may try a PIN now.
 *
 * @param args.organizationId - The workspace the QR belongs to
 * @param args.ip - The client's IP, from `getClientIp`
 * @returns `locked`, and how long until the lock ends (0 when not locked)
 */
export function checkLockout(args: LockoutKey): {
  locked: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const lockedUntil = Math.max(
    readCounter(clientKey(args), now)?.lockedUntil ?? 0,
    readCounter(orgKey(args), now)?.lockedUntil ?? 0
  );
  if (lockedUntil <= now) return { locked: false, retryAfterSeconds: 0 };
  return {
    locked: true,
    retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000),
  };
}

/**
 * Records a wrong PIN against both the client and the workspace.
 *
 * @param args.organizationId - The workspace the QR belongs to
 * @param args.ip - The client's IP
 */
export function recordFailedPin(args: LockoutKey): void {
  const now = Date.now();
  bump(clientKey(args), MAX_FAILURES_PER_CLIENT, now);
  bump(orgKey(args), MAX_FAILURES_PER_ORG, now);
}

/**
 * Forgets a client's failures after a correct PIN. The workspace counter is
 * kept: one right answer must not reset a distributed guessing run.
 *
 * @param args.organizationId - The workspace the QR belongs to
 * @param args.ip - The client's IP
 */
export function clearFailedPins(args: LockoutKey): void {
  counters.delete(clientKey(args));
}

/** Empties every counter. Tests only. */
export function resetLockoutsForTests(): void {
  counters.clear();
}
