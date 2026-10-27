/**
 * OTP Page Copy
 *
 * The heading, sub-heading and button text of the one-time-password page for
 * each way of arriving there. Text is stored as translation keys and rendered
 * through i18next, so the page follows the user's language.
 *
 * @see {@link file://../routes/_auth+/otp.tsx}
 */
import { Trans, useTranslation } from "react-i18next";
import SubHeading from "~/components/shared/sub-heading";
import { getAppName } from "~/modules/branding/instance-branding";

export type OtpVerifyMode = "login" | "signup" | "confirm_signup";

/** Translation keys for one OTP page variant. */
type OtpPageCopy = {
  titleKey:
    | "auth.otpPage.login.title"
    | "auth.otpPage.signup.title"
    | "auth.otpPage.confirmSignup.title"
    | "auth.otpPage.default.title";
  subHeadingKey:
    | "auth.otpPage.login.subHeading"
    | "auth.otpPage.signup.subHeading"
    | "auth.otpPage.confirmSignup.subHeading"
    | "auth.otpPage.default.subHeading";
  buttonKey:
    | "auth.otpPage.login.button"
    | "auth.otpPage.signup.button"
    | "auth.otpPage.confirmSignup.button"
    | "auth.otpPage.default.button";
};

const OTP_PAGE_MAP: Record<OtpVerifyMode, OtpPageCopy> = {
  login: {
    titleKey: "auth.otpPage.login.title",
    subHeadingKey: "auth.otpPage.login.subHeading",
    buttonKey: "auth.otpPage.login.button",
  },
  signup: {
    titleKey: "auth.otpPage.signup.title",
    subHeadingKey: "auth.otpPage.signup.subHeading",
    buttonKey: "auth.otpPage.signup.button",
  },
  confirm_signup: {
    titleKey: "auth.otpPage.confirmSignup.title",
    subHeadingKey: "auth.otpPage.confirmSignup.subHeading",
    buttonKey: "auth.otpPage.confirmSignup.button",
  },
};

const DEFAULT_PAGE_DATA: OtpPageCopy = {
  titleKey: "auth.otpPage.default.title",
  subHeadingKey: "auth.otpPage.default.subHeading",
  buttonKey: "auth.otpPage.default.button",
};

/**
 * The copy for an OTP page variant.
 *
 * @param mode - Why the user is entering a code; unknown modes get a generic page
 * @returns Translation keys for the heading, sub-heading and button
 */
export function getOtpPageData(mode: OtpVerifyMode): OtpPageCopy {
  return OTP_PAGE_MAP[mode] ?? DEFAULT_PAGE_DATA;
}

/**
 * The OTP page sub-heading, with the address the code went to in bold.
 *
 * @param props.mode - Why the user is entering a code
 * @param props.email - The address the code was sent to
 */
export function OtpSubHeading({
  mode,
  email,
}: {
  mode: OtpVerifyMode;
  email: string;
}) {
  const { t } = useTranslation();
  return (
    <SubHeading className="-mt-4 text-center">
      <Trans
        t={t}
        i18nKey={getOtpPageData(mode).subHeadingKey}
        values={{ email, appName: getAppName() }}
        components={{ bold: <span className="font-bold text-gray-900" /> }}
      />
    </SubHeading>
  );
}
