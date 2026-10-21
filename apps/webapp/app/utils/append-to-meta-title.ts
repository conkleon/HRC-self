import { getAppName } from "~/modules/branding/instance-branding";

/**
 * Builds a page title of the form `<title> | <app name>`, where the app name
 * is `APP_NAME` (default "Shelf").
 *
 * @param title - The route's own title; "Not found" when missing
 * @returns The full document title
 */
export const appendToMetaTitle = (title: string | null | undefined) =>
  `${title ? title : "Not found"} | ${getAppName()}`;
