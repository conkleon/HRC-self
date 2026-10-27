import { useTranslation } from "react-i18next";
import FormRow from "~/components/forms/form-row";
import Input from "~/components/forms/input";

export function DescriptionField({
  description,
  fieldName,
  disabled,
  error,
}: {
  description: string | undefined;
  fieldName: string;
  disabled: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <FormRow
      rowLabel={t("bookings.description.description")}
      className="mobile-styling-only h-full border-b-0 p-0"
    >
      <Input
        label={t("bookings.description.description")}
        inputType="textarea"
        hideLabel
        name={fieldName}
        disabled={disabled}
        error={error}
        className="mobile-styling-only w-full p-0"
        defaultValue={description || undefined}
        placeholder={t("bookings.description.addADescription")}
      />
    </FormRow>
  );
}
