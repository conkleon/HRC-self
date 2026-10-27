import { useTranslation } from "react-i18next";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { useZorm } from "react-zorm";
import { z } from "zod";
import { Form } from "~/components/custom-form";

import Input from "~/components/forms/input";
import PasswordInput from "~/components/forms/password-input";
import { Button } from "~/components/shared/button";
import { config } from "~/config/shelf.config";
import { useSearchParams } from "~/hooks/search-params";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import { getServerT } from "~/i18n/i18n.server";
import { ContinueWithEmailForm } from "~/modules/auth/components/continue-with-email-form";
import {
  INVALID_CREDENTIALS_MESSAGE,
  signInWithEmail,
} from "~/modules/auth/service.server";
import { isSsoDomainEmail } from "~/modules/auth/sso-enforcement.server";

import {
  getSelectedOrganization,
  setSelectedOrganizationIdCookie,
} from "~/modules/organization/context.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { expireListPreferenceCookies, setCookie } from "~/utils/cookies.server";
import {
  ShelfError,
  isLikeShelfError,
  isZodValidationError,
  makeShelfError,
  notAllowedMethod,
} from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import {
  payload,
  error,
  getActionMethod,
  parseData,
  safeRedirect,
} from "~/utils/http.server";
import { validEmail } from "~/utils/misc";

export async function loader({ context }: LoaderFunctionArgs) {
  if (context.isAuthenticated) {
    return redirect("/");
  }

  const t = await getServerT(context);
  const title = t("auth.pages.login.title");
  const subHeading = t("auth.pages.login.subHeading");
  const { disableSignup, disableSSO } = config;

  return data(payload({ title, subHeading, disableSignup, disableSSO }));
}

const LoginFormSchema = z.object({
  email: z
    .string()
    .transform((email) => email.toLowerCase())
    .refine(validEmail, () => ({
      message: "Please enter a valid email",
    })),
  password: z.string().min(8, "Password is too short. Minimum 8 characters."),
  redirectTo: z.string().optional(),
});

export async function action({ context, request }: ActionFunctionArgs) {
  /**
   * Set when a wrong email/password pair was typed for an address on a domain
   * configured for SSO. It depends only on the domain, never on the account, so
   * it is the same for every address on that domain whether or not it exists.
   */
  let ssoDomainHint = false;

  try {
    const method = getActionMethod(request);

    switch (method) {
      case "POST": {
        // Guard against bots sending non-form content types
        const contentType = request.headers.get("content-type") || "";
        if (
          !contentType.includes("application/x-www-form-urlencoded") &&
          !contentType.includes("multipart/form-data")
        ) {
          return data(
            error(
              new ShelfError({
                cause: null,
                message: "Invalid request",
                label: "Request validation",
                shouldBeCaptured: false,
                status: 400,
              }),
              false
            ),
            { status: 400 }
          );
        }

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch (cause) {
          return data(
            error(
              new ShelfError({
                cause,
                message: "Invalid request body",
                label: "Request validation",
                shouldBeCaptured: false,
                status: 400,
              }),
              false
            ),
            { status: 400 }
          );
        }

        const { email, password, redirectTo } = parseData(
          formData,
          LoginFormSchema,
          { shouldBeCaptured: false }
        );

        let authSession: Awaited<ReturnType<typeof signInWithEmail>>;
        try {
          authSession = await signInWithEmail(email, password);
        } catch (cause) {
          if (
            isLikeShelfError(cause) &&
            cause.message === INVALID_CREDENTIALS_MESSAGE
          ) {
            // The hint is a courtesy: a failed domain lookup must not replace
            // the sign-in error the person actually needs to see.
            ssoDomainHint = await isSsoDomainEmail(email).catch(() => false);
          }
          throw cause;
        }

        if (!authSession) {
          return redirect(`/otp?email=${encodeURIComponent(email)}&mode=login`);
        }
        const { userId } = authSession;

        /**
         * The only reason we need to do this is because of the initial login
         * Theoretically, the user should always have a selected organization cookie as soon as they login for the first time
         * However we do this check to make sure they are still part of that organization
         */
        const { organizationId } = await getSelectedOrganization({
          userId,
          request,
        });

        // Set the auth session and redirect to the role's landing page
        context.setSession(authSession);

        return redirect(safeRedirect(redirectTo || "/"), {
          headers: [
            ...(await expireListPreferenceCookies(request, {
              event: "sign-in",
            })),
            setCookie(await setSelectedOrganizationIdCookie(organizationId)),
          ],
        });
      }
    }

    throw notAllowedMethod(method);
  } catch (cause) {
    const reason = makeShelfError(
      cause,
      undefined,
      isLikeShelfError(cause)
        ? cause.shouldBeCaptured
        : !isZodValidationError(cause)
    );
    return data({ ...error(reason), ssoDomainHint }, { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.title) : "" },
];

export default function IndexLoginForm() {
  const { t } = useTranslation();
  const { disableSignup, disableSSO } = useLoaderData<typeof loader>();
  const zo = useZorm("NewQuestionWizardScreen", LoginFormSchema);
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? undefined;
  const acceptedInvite = searchParams.get("acceptedInvite");
  const passwordReset = searchParams.get("password_reset");
  /** Set by the app layout when it ends a session whose address must use SSO. */
  const ssoRequired = searchParams.get("sso_required");
  const data = useActionData<typeof action>();
  const ssoDomainHint = Boolean(
    data && "ssoDomainHint" in data && data.ssoDomainHint
  );

  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);

  /** Focus the email field on mount (intentional first-field focus on auth pages). */
  const emailInputRef = useAutoFocus<HTMLInputElement>();

  return (
    <div className="w-full max-w-md">
      {acceptedInvite ? (
        <div className="mb-8 text-center text-success-600">
          {t("auth.login.successfullyAcceptedWorkspaceInvitePleas")}
        </div>
      ) : null}

      {passwordReset ? (
        <div className="mb-8 text-center text-success-600">
          {t("auth.login.youHaveSuccessfullyResetYour")}
        </div>
      ) : null}

      {ssoRequired ? (
        <div role="alert" className="mb-8 text-center text-error-600">
          {t("auth.login.thisEmailAddressSignsIn")}
        </div>
      ) : null}
      <Form ref={zo.ref} method="post" replace className="flex flex-col gap-5">
        <div>
          <Input
            ref={emailInputRef}
            data-test-id="email"
            label={t("auth.login.emailAddress")}
            placeholder="zaans@huisje.com"
            required
            name={zo.fields.email()}
            type="email"
            autoComplete="username"
            disabled={disabled}
            inputClassName="w-full"
            error={zo.errors.email()?.message || data?.error.message}
          />
        </div>
        <PasswordInput
          label={t("auth.login.password")}
          placeholder="**********"
          data-test-id="password"
          name={zo.fields.password()}
          autoComplete="current-password"
          disabled={disabled}
          inputClassName="w-full"
          error={zo.errors.password()?.message || data?.error.message}
        />
        <input type="hidden" name={zo.fields.redirectTo()} value={redirectTo} />
        {ssoDomainHint ? (
          <p role="status" className="text-sm text-gray-600">
            {t("auth.login.ifYourOrganizationUsesSingle")}{" "}
            <Button variant="link" to="/sso-login">
              {t("auth.login.loginWithSso")}
            </Button>
            .
          </p>
        ) : null}
        <Button
          className="text-center"
          type="submit"
          data-test-id="login"
          disabled={disabled}
        >
          {t("auth.login.logIn")}
        </Button>
        <div className="flex flex-col items-center justify-center">
          <div className="text-center text-sm text-gray-500">
            {t("auth.login.dontRememberYourPassword")}{" "}
            <Button
              variant="link"
              to={{
                pathname: "/forgot-password",
                search: searchParams.toString(),
              }}
            >
              {t("auth.login.resetPassword")}
            </Button>
          </div>
        </div>
      </Form>
      {!disableSSO && (
        <div className="mt-6 text-center">
          <Button variant="link" to="/sso-login">
            {t("auth.login.loginWithSso")}
          </Button>
        </div>
      )}

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">
              {t("auth.login.orUseA")}{" "}
              <strong title={t("auth.login.oneTimePasswordOtpIs")}>
                {t("auth.login.oneTimePassword")}
              </strong>
            </span>
          </div>
        </div>
        <div className="mt-6">
          <ContinueWithEmailForm mode="login" />
        </div>
        {disableSignup ? null : (
          <div className="mt-6 text-center text-sm text-gray-500">
            {t("auth.login.dontHaveAnAccount")}{" "}
            <Button
              variant="link"
              data-test-id="signupButton"
              to={{
                pathname: "/join",
                search: searchParams.toString(),
              }}
            >
              {t("auth.login.signUp")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
