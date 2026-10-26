/**
 * Add As Shortcut
 *
 * The "Add as shortcut" link at the foot of the public self-service page,
 * styled quietly so it never competes with the take-or-return controls. It
 * lets a volunteer keep their workspace's self-service link on the phone's
 * home screen, so next time they open it from an icon instead of scanning the
 * poster again. The page links a manifest of its own (named after the
 * workspace, starting at this link), so the shortcut opens back here.
 *
 * Where the browser offers an install prompt (Chrome and Edge on Android and
 * desktop), the button opens it. Everywhere else (Safari on iPhone and iPad,
 * Firefox) no page can add a shortcut on its own, so the button shows the
 * two taps that do it. Once the page runs from a shortcut, the button hides.
 *
 * @see {@link file://./../../routes/self-service+/$token.tsx}
 * @see {@link file://./../../routes/self-service+/$token_.manifest[.webmanifest].ts}
 */
import { useEffect, useId, useState } from "react";
import { SmartphoneIcon } from "lucide-react";

import { Button } from "~/components/shared/button";

/**
 * Chrome's install prompt event. Not in the DOM typings because only
 * Chromium browsers fire it.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Which set of manual steps fits the volunteer's device. */
export type ShortcutPlatform = "ios" | "android" | "desktop";

/**
 * Picks the manual steps for a device. iPadOS reports a Mac user agent, so a
 * "Mac" with a touch screen is treated as an iPad.
 *
 * @param userAgent - `navigator.userAgent`
 * @param maxTouchPoints - `navigator.maxTouchPoints`
 * @returns The platform whose steps to show
 */
export function shortcutPlatform(
  userAgent: string,
  maxTouchPoints: number
): ShortcutPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/** Whether the page is already open from a home-screen shortcut. */
function isRunningAsShortcut() {
  const iosStandalone =
    "standalone" in navigator &&
    (navigator as { standalone?: boolean }).standalone === true;
  return (
    iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches
  );
}

/** The manual steps for each platform. */
function ShortcutSteps({ platform }: { platform: ShortcutPlatform }) {
  if (platform === "ios") {
    return (
      <>
        <ol className="list-inside list-decimal space-y-1">
          <li>
            Tap the <b>Share</b> button (the square with an arrow pointing up).
          </li>
          <li>
            Choose <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
        </ol>
        <p className="mt-2 text-gray-600">
          The first time you open the shortcut, you may need to enter the PIN
          again.
        </p>
      </>
    );
  }
  if (platform === "android") {
    return (
      <ol className="list-inside list-decimal space-y-1">
        <li>
          Open your browser's menu (the three dots, usually at the top right).
        </li>
        <li>
          Choose <b>Add to Home screen</b> or <b>Install app</b>.
        </li>
      </ol>
    );
  }
  return (
    <p>
      Bookmark this page with <b>Ctrl+D</b> (<b>Cmd+D</b> on a Mac), or install
      it from your browser's menu.
    </p>
  );
}

/** "Add as shortcut" button, with manual steps where no prompt exists. */
export function AddShortcutButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const [platform, setPlatform] = useState<ShortcutPlatform | null>(null);
  const stepsId = useId();

  useEffect(() => {
    if (isRunningAsShortcut()) {
      setHidden(true);
      return;
    }

    function onBeforeInstallPrompt(event: Event) {
      // Keep the browser's own mini-bar away; the button opens the prompt
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setHidden(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  async function handleClick() {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      // A prompt can be shown only once; a dismissed one falls back to steps
      setInstallPrompt(null);
      if (outcome === "accepted") setHidden(true);
      return;
    }
    setPlatform((open) =>
      open
        ? null
        : shortcutPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0)
    );
  }

  return (
    <div className="mt-10 flex flex-col items-center">
      <Button
        type="button"
        variant="link-gray"
        onClick={handleClick}
        aria-expanded={installPrompt ? undefined : platform !== null}
        aria-controls={platform ? stepsId : undefined}
      >
        <span className="inline-flex items-center gap-2">
          <SmartphoneIcon className="size-3.5" aria-hidden="true" />
          Add as shortcut
        </span>
      </Button>
      {platform ? (
        <div
          id={stepsId}
          className="mt-3 w-full max-w-md rounded-md border border-gray-200 bg-white p-4 text-left text-sm text-gray-700"
        >
          <p className="mb-2 font-medium text-gray-900">
            Keep this workspace on your home screen:
          </p>
          <ShortcutSteps platform={platform} />
        </div>
      ) : null}
    </div>
  );
}
