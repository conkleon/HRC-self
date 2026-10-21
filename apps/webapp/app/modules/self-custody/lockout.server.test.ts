// @vitest-environment node
/**
 * Tests for the wrong-PIN lockout of self-service custody.
 *
 * @see {@link file://./lockout.server.ts}
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOCKOUT_WINDOW_MS,
  MAX_FAILURES_PER_CLIENT,
  MAX_FAILURES_PER_ORG,
  checkLockout,
  clearFailedPins,
  recordFailedPin,
  resetLockoutsForTests,
} from "./lockout.server";

const org = "org-1";
const ip = "203.0.113.7";

describe("self-service PIN lockout", () => {
  beforeEach(() => {
    // why: the lockout window is 15 minutes; fake timers move through it
    vi.useFakeTimers();
    resetLockoutsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the limits from the spec", () => {
    expect(MAX_FAILURES_PER_CLIENT).toBe(5);
    expect(MAX_FAILURES_PER_ORG).toBe(50);
    expect(LOCKOUT_WINDOW_MS).toBe(15 * 60_000);
  });

  it("locks a client after 5 failures within 15 minutes", () => {
    for (let i = 0; i < 4; i++) recordFailedPin({ organizationId: org, ip });
    expect(checkLockout({ organizationId: org, ip }).locked).toBe(false);

    recordFailedPin({ organizationId: org, ip });
    const state = checkLockout({ organizationId: org, ip });
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
    expect(state.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it("does not lock another client of the same workspace", () => {
    for (let i = 0; i < 5; i++) recordFailedPin({ organizationId: org, ip });
    expect(
      checkLockout({ organizationId: org, ip: "198.51.100.2" }).locked
    ).toBe(false);
  });

  it("unlocks after 15 minutes", () => {
    for (let i = 0; i < 5; i++) recordFailedPin({ organizationId: org, ip });
    vi.advanceTimersByTime(LOCKOUT_WINDOW_MS + 1);
    expect(checkLockout({ organizationId: org, ip }).locked).toBe(false);
  });

  it("locks the whole workspace after 50 failures from many IPs", () => {
    for (let i = 0; i < 50; i++) {
      recordFailedPin({ organizationId: org, ip: `10.0.${i}.1` });
    }
    expect(checkLockout({ organizationId: org, ip: "10.9.9.9" }).locked).toBe(
      true
    );
    expect(
      checkLockout({ organizationId: "org-2", ip: "10.9.9.9" }).locked
    ).toBe(false);
  });

  it("a success clears the client's count", () => {
    for (let i = 0; i < 4; i++) recordFailedPin({ organizationId: org, ip });
    clearFailedPins({ organizationId: org, ip });
    recordFailedPin({ organizationId: org, ip });
    expect(checkLockout({ organizationId: org, ip }).locked).toBe(false);
  });
});
