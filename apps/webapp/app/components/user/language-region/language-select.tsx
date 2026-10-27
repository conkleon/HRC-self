/**
 * LanguageSelect
 *
 * Controlled selector for the UI language. Each option is named in its own
 * language so people can find theirs whatever the UI is currently in.
 *
 * Thin wrapper over {@link EnumPreferenceSelect}.
 *
 * @see {@link file://./enum-preference-select.tsx}
 * @see {@link file://./language-region-form.tsx}
 */
import { useTranslation } from "react-i18next";
import {
  LOCALE_NATIVE_NAMES,
  SUPPORTED_LOCALES,
  type AppLocale,
} from "~/i18n/config";
import { EnumPreferenceSelect } from "./enum-preference-select";

/** Props for the controlled language selector. */
type LanguageSelectProps = {
  /** Name of the hidden input the value is submitted under. */
  name: string;
  /** Current language. */
  value: AppLocale;
  /** Called with the newly-chosen language. */
  onChange: (value: AppLocale) => void;
  /** Optional class applied to the trigger button. */
  className?: string;
};

/**
 * Controlled language dropdown.
 *
 * @param props.name - Hidden-input name for form submission
 * @param props.value - Current language
 * @param props.onChange - Selection callback
 * @param props.className - Optional trigger class
 * @returns The language selector control
 */
export function LanguageSelect(props: LanguageSelectProps) {
  const { t } = useTranslation();
  const options = SUPPORTED_LOCALES.map((locale) => ({
    value: locale,
    label: LOCALE_NATIVE_NAMES[locale],
    description: t(`settings.languageRegion.languageDescriptions.${locale}`),
  }));
  return (
    <EnumPreferenceSelect
      {...props}
      options={options}
      ariaLabel={t("settings.languageRegion.languageOptions")}
    />
  );
}
