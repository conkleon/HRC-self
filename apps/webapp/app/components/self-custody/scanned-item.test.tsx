/**
 * Self-service scanned item - unit tests
 *
 * Covers the query a scan navigates to and what the scanned panel offers:
 * take, return for the holder, a note for someone else's item, the staff
 * reason, and an unknown code. Every action posts the code, never an id.
 *
 * @see {@link file://./scanned-item.tsx}
 */
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { ScannedItemPanel, scanSearchParams } from "./scanned-item";
import type { ScannedResult } from "./scanned-item";

const KIT = {
  kind: "kit" as const,
  title: "Trauma kit",
  locationName: "Depot",
  itemCount: 4,
};

/** Renders the panel inside a router, as the page does. */
function renderPanel(scanned: ScannedResult, error: string | null = null) {
  const Stub = createRoutesStub([
    {
      path: "/self-service/tok",
      Component: () => (
        <ScannedItemPanel scanned={scanned} memberId="tm-1" error={error} />
      ),
    },
  ]);
  return render(
    <Stub
      initialEntries={["/self-service/tok?member=tm-1&scan=qr-1&scanType=qr"]}
    />
  );
}

/** The hidden fields of the panel's form. */
function hiddenFields() {
  const form = document.querySelector("form");
  return Object.fromEntries(new FormData(form as HTMLFormElement).entries());
}

describe("scanSearchParams", () => {
  it("adds the code and its type, keeping the volunteer and filters but not the page", () => {
    const next = scanSearchParams(
      new URLSearchParams("member=tm-1&q=radio&page=3&scan=old"),
      { value: "qr-9", type: "qr" }
    );
    expect(Object.fromEntries(next)).toEqual({
      member: "tm-1",
      q: "radio",
      scan: "qr-9",
      scanType: "qr",
    });
  });
});

describe("ScannedItemPanel", () => {
  it("offers to take an available kit, posting the scanned code", async () => {
    renderPanel({
      code: "qr-1",
      codeType: "qr",
      state: { kind: "available", item: KIT },
      heldByYou: false,
    });

    expect(await screen.findByText("Trauma kit")).toBeInTheDocument();
    expect(screen.getByText("Kit of 4 items")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Take this kit" })
    ).toBeInTheDocument();
    expect(hiddenFields()).toEqual({
      intent: "scan-take",
      code: "qr-1",
      codeType: "qr",
      teamMemberId: "tm-1",
    });
  });

  it("offers the return only to the volunteer holding it", async () => {
    const held = {
      code: "qr-1",
      codeType: "qr" as const,
      state: {
        kind: "in-custody" as const,
        item: KIT,
        holderName: "Eleni K.",
      },
    };

    const { unmount } = renderPanel({ ...held, heldByYou: true });
    expect(
      await screen.findByRole("button", { name: "Return this kit" })
    ).toBeInTheDocument();
    expect(hiddenFields()).toMatchObject({ intent: "scan-return" });
    unmount();

    renderPanel({ ...held, heldByYou: false });
    expect(await screen.findByText("Eleni K.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("explains why staff must handle it", async () => {
    renderPanel({
      code: "qr-1",
      codeType: "qr",
      state: { kind: "unsupported", item: KIT, reason: "kit-checked-out" },
      heldByYou: false,
    });
    expect(
      await screen.findByText(
        "This kit is booked out. Please return it to staff."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when the code labels nothing in the workspace", async () => {
    renderPanel({
      code: "qr-x",
      codeType: "qr",
      state: null,
      heldByYou: false,
    });
    expect(
      await screen.findByText(
        "This code is not linked to any item or kit in this workspace."
      )
    ).toBeInTheDocument();
  });

  it("closes by dropping only the scan from the URL", async () => {
    renderPanel({
      code: "qr-1",
      codeType: "qr",
      state: { kind: "available", item: KIT },
      heldByYou: false,
    });
    expect(await screen.findByRole("link", { name: "Close" })).toHaveAttribute(
      "href",
      "/self-service/tok?member=tm-1"
    );
  });
});
