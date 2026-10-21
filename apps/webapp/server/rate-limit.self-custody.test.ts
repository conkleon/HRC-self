// @vitest-environment node
/**
 * Tests for the per-IP rate limit on the public self-service custody pages.
 *
 * @see {@link file://./rate-limit.ts}
 */
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Logger } from "~/utils/logger";
import { redactSelfCustodyPath, selfCustodyRateLimit } from "./rate-limit";

// why: the limiter's 429 trail goes through Logger, which talks to Sentry
vi.mock("~/utils/logger", () => ({
  Logger: {
    handledClientError: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  },
}));

/**
 * A Hono app wired like `server/index.ts`: the limiter guards only the
 * self-service pages; the handler always answers 200, so a 429 can only come
 * from the limiter.
 */
function makeApp(limit: number) {
  const app = new Hono();
  // Created once so its in-memory store persists across requests.
  const limiter = selfCustodyRateLimit(limit);
  app.use("/qr/:qrId/self-custody", limiter);
  app.use("/self-service/:token", limiter);
  app.all("*", (c) => c.text("ok"));
  return app;
}

const from = (ip: string) => ({ headers: { "X-Forwarded-For": ip } });

describe("selfCustodyRateLimit", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to 30 requests per minute", async () => {
    vi.stubEnv("FLY_APP_NAME", "");
    const app = makeApp(undefined as unknown as number);
    for (let i = 0; i < 30; i++) {
      const ok = await app.request("/qr/qr-1/self-custody", from("1.1.1.1"));
      expect(ok.status).toBe(200);
    }
    const limited = await app.request("/qr/qr-1/self-custody", from("1.1.1.1"));
    expect(limited.status).toBe(429);
  });

  it("answers 429 past the limit, per client IP", async () => {
    vi.stubEnv("FLY_APP_NAME", "");
    const app = makeApp(3);
    for (let i = 0; i < 3; i++) {
      expect(
        (await app.request("/qr/qr-1/self-custody", from("1.1.1.1"))).status
      ).toBe(200);
    }
    const limited = await app.request("/qr/qr-2/self-custody", from("1.1.1.1"));
    expect(limited.status).toBe(429);
    expect(await limited.text()).toContain("Too many requests");

    expect(
      (await app.request("/qr/qr-1/self-custody", from("2.2.2.2"))).status
    ).toBe(200);
  });

  it("leaves other QR pages alone", async () => {
    vi.stubEnv("FLY_APP_NAME", "");
    const app = makeApp(1);
    await app.request("/qr/qr-1/self-custody", from("1.1.1.1"));
    expect((await app.request("/qr/qr-1", from("1.1.1.1"))).status).toBe(200);
  });

  it("shares one bucket per IP between the scan page and the browse page", async () => {
    vi.stubEnv("FLY_APP_NAME", "");
    const app = makeApp(1);
    await app.request("/qr/qr-1/self-custody", from("3.3.3.3"));
    expect(
      (await app.request("/self-service/tok-1", from("3.3.3.3"))).status
    ).toBe(429);
  });

  it("never logs the browse page's secret token", async () => {
    vi.stubEnv("FLY_APP_NAME", "");
    const app = makeApp(1);
    await app.request("/self-service/secret-tok", from("4.4.4.4"));
    await app.request("/self-service/secret-tok", from("4.4.4.4"));

    const logged = JSON.stringify(
      Object.values(vi.mocked(Logger)).flatMap((fn) => fn.mock.calls)
    );
    expect(logged).toContain("/self-service/:token");
    expect(logged).not.toContain("secret-tok");
  });
});

describe("redactSelfCustodyPath", () => {
  it("hides the browse token and keeps QR paths", () => {
    expect(redactSelfCustodyPath("/self-service/abc123")).toBe(
      "/self-service/:token"
    );
    expect(redactSelfCustodyPath("/self-service/abc123.data")).toBe(
      "/self-service/:token"
    );
    expect(redactSelfCustodyPath("/qr/qr-1/self-custody")).toBe(
      "/qr/qr-1/self-custody"
    );
  });
});
