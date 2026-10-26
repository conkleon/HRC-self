/**
 * Tests for the self-service "Add as shortcut" button: the browser's install
 * prompt where there is one, the manual steps everywhere else, and no button
 * once the page runs from a shortcut.
 *
 * @see {@link file://./add-shortcut.tsx}
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddShortcutButton, shortcutPlatform } from "./add-shortcut";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_FIREFOX =
  "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";
const WINDOWS_FIREFOX =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shortcutPlatform", () => {
  it.each([
    [IPHONE, 5, "ios"],
    [IPAD_AS_MAC, 5, "ios"],
    [IPAD_AS_MAC, 0, "desktop"],
    [ANDROID_FIREFOX, 5, "android"],
    [WINDOWS_FIREFOX, 0, "desktop"],
  ])("reads %s with %i touch points as %s", (ua, touch, expected) => {
    expect(shortcutPlatform(ua, touch)).toBe(expected);
  });
});

describe("AddShortcutButton", () => {
  it("shows the iPhone steps where there is no install prompt", () => {
    // why: the steps depend on the device, which the test environment fakes
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    render(<AddShortcutButton />);

    const button = screen.getByRole("button", { name: "Add as shortcut" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Add to Home Screen")).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByText("Add to Home Screen")).toBeNull();
  });

  it("opens the browser's install prompt when it offers one", async () => {
    render(<AddShortcutButton />);

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(
      new Event("beforeinstallprompt", { cancelable: true }),
      {
        prompt,
        userChoice: Promise.resolve({ outcome: "accepted" as const }),
      }
    );
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add as shortcut" }));

    expect(prompt).toHaveBeenCalledTimes(1);
    // Installed: nothing left to offer
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Add as shortcut" })
      ).toBeNull()
    );
  });

  it("hides once the page is open from a shortcut", () => {
    // why: display mode is a property of how the browser launched the page
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    render(<AddShortcutButton />);

    expect(
      screen.queryByRole("button", { name: "Add as shortcut" })
    ).toBeNull();
  });
});
