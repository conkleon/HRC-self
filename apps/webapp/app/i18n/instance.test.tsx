/**
 * The app's i18n instance renders the requested language, and `<Trans>`
 * keeps the elements a sentence wraps. Numbered slots (`<0>…</0>`) index
 * into a `components` ARRAY: passed as an object they are silently dropped,
 * and the sentence renders without its link.
 */
import { render, screen } from "@testing-library/react";
import { I18nextProvider, Trans, useTranslation } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createI18n } from "./instance";

/** A sentence with a link slot, as the asset booking tooltip renders it. */
function BookingConflict() {
  const { t } = useTranslation();
  return (
    <p>
      <Trans
        t={t}
        i18nKey="bookings.availabilityLabel.thisAssetIsAddedTo2"
        values={{ name: "Αποστολή Πάτρας" }}
        components={[
          <a key="slot0" href="/bookings/b1">
            link
          </a>,
        ]}
      />
    </p>
  );
}

describe("createI18n", () => {
  it("renders Greek with the wrapped link intact", () => {
    render(
      <I18nextProvider i18n={createI18n("el")}>
        <BookingConflict />
      </I18nextProvider>
    );
    const link = screen.getByRole("link", { name: "Αποστολή Πάτρας" });
    expect(link).toHaveAttribute("href", "/bookings/b1");
    expect(link.closest("p")).toHaveTextContent(/^Αυτό το αντικείμενο/);
  });

  it("falls back to English for a key Greek lacks", () => {
    const i18n = createI18n("el");
    i18n.addResource("en", "translation", "test.onlyEnglish", "Only English");
    expect(i18n.t("test.onlyEnglish" as never)).toBe("Only English");
  });
});
