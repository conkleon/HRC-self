/**
 * Browse lists - unit tests
 *
 * Covers what a volunteer can open and enter on a row: a kit's contents,
 * shown on tap, and the unit count of a quantity-tracked item; and the row
 * thumbnails, which fall back to an icon.
 *
 * @see {@link file://./browse-lists.tsx}
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { MyItems } from "./browse-lists";
import type { BrowseItem } from "./browse-lists";

/** A kit row holding one individual item and a share of a stock item. */
const KIT: BrowseItem = {
  kind: "kit",
  id: "k1",
  title: "Trauma kit",
  locationName: "Depot",
  categoryName: null,
  itemCount: 2,
  units: null,
  contents: [
    {
      id: "q1",
      title: "Bandages",
      quantity: 20,
      imageUrl: "https://storage/q1-thumb.jpg",
    },
    { id: "a1", title: "Splint", quantity: null, imageUrl: null },
  ],
  imageUrl: null,
};

/** A consumable stock item the volunteer holds 5 of. */
const BANDAGES: BrowseItem = {
  kind: "item",
  id: "q2",
  title: "Gauze",
  locationName: null,
  categoryName: null,
  itemCount: null,
  units: { count: 5, oneWay: true },
  contents: null,
  imageUrl: "https://storage/q2-thumb.jpg",
};

/** Renders the volunteer's list inside a data router. */
async function renderMine(items: BrowseItem[]) {
  const Stub = createRoutesStub([
    {
      path: "/",
      HydrateFallback: () => null,
      Component: () => <MyItems items={items} memberId="tm-1" />,
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
  await screen.findByText(items[0].title);
}

describe("MyItems", () => {
  it("shows what is inside a kit when its name is tapped, and hides it again", async () => {
    await renderMine([KIT]);
    const toggle = screen.getByRole("button", { name: /^Trauma kit/ });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("kit-contents-return-k1")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const contents = document.getElementById("kit-contents-return-k1");
    expect(contents).not.toBeNull();
    expect(contents).toHaveTextContent("Bandages× 20");
    expect(contents).toHaveTextContent("Splint");

    fireEvent.click(toggle);
    expect(document.getElementById("kit-contents-return-k1")).toBeNull();
  });

  it("asks how many of a consumable came back, from 0 to everything held", async () => {
    await renderMine([BANDAGES]);
    const field = screen.getByLabelText("Back");

    expect(field).toHaveAttribute("name", "units");
    expect(field).toHaveAttribute("min", "0");
    expect(field).toHaveAttribute("max", "5");
    expect(field).toHaveValue(5);
    expect(field).toHaveAccessibleDescription(
      "Enter how many you are bringing back. The rest are recorded as used."
    );
    expect(screen.getByText("You have 5")).toBeInTheDocument();
  });

  it("shows a row's picture, and the icon instead when it fails to load", async () => {
    await renderMine([BANDAGES]);
    const picture = document.querySelector(
      'img[src="https://storage/q2-thumb.jpg"]'
    );

    expect(picture).not.toBeNull();
    expect(picture).toHaveAttribute("alt", "");
    expect(picture).toHaveAttribute("loading", "lazy");

    fireEvent.error(picture!);
    expect(
      document.querySelector('img[src="https://storage/q2-thumb.jpg"]')
    ).toBeNull();
  });

  it("shows the pictures of a kit's items when it is opened", async () => {
    await renderMine([KIT]);
    fireEvent.click(screen.getByRole("button", { name: /^Trauma kit/ }));

    const contents = document.getElementById("kit-contents-return-k1");
    expect(
      contents?.querySelector('img[src="https://storage/q1-thumb.jpg"]')
    ).not.toBeNull();
    // Splint has no picture, so it keeps the icon.
    expect(contents?.querySelectorAll("img")).toHaveLength(1);
  });
});
