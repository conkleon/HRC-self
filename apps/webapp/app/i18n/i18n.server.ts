/**
 * Server-side Translation
 *
 * Gives loaders and actions a `t` in the requesting user's language, for text
 * that is built on the server: page headings returned from loaders, toast
 * notifications, validation and error messages. The language is resolved
 * exactly as the root loader resolves it, so server and client text agree.
 *
 * @see {@link file://./config.ts}
 * @see {@link file://../root.tsx}
 */

import type { TFunction } from "i18next";
import type { AppLoadContext } from "react-router";
import { db } from "~/database/db.server";
import { DEFAULT_LOCALE } from "~/utils/env";
import { resolveLocale, type AppLocale } from "./config";
import { createI18n } from "./instance";

/**
 * Resolves the language for a request: the signed-in user's choice, else the
 * instance default. Pages without a session (login, signup) get the default.
 *
 * @param context - The request's load context
 * @returns The locale to render server-built text in
 */
export async function getRequestLocale(
  context: AppLoadContext
): Promise<AppLocale> {
  let userLocale: string | null | undefined;
  try {
    const { userId } = context.getSession();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });
    userLocale = user?.locale;
  } catch {
    // No session, or the lookup failed: the instance default applies.
  }
  return resolveLocale({ userLocale, instanceDefault: DEFAULT_LOCALE });
}

/**
 * A translation function for the requesting user.
 *
 * @param context - The request's load context
 * @returns `t` bound to the request's language
 */
export async function getServerT(context: AppLoadContext): Promise<TFunction> {
  return createI18n(await getRequestLocale(context)).t;
}

/**
 * A translation function for a known user, for work done on their behalf
 * outside their own request (emails, notifications to other members).
 *
 * @param userLocale - That user's saved `User.locale`
 * @returns `t` bound to that user's language
 */
export function getTForUser(userLocale: string | null | undefined): TFunction {
  return createI18n(
    resolveLocale({ userLocale, instanceDefault: DEFAULT_LOCALE })
  ).t;
}
