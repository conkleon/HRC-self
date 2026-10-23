/**
 * KitStatusBadge - unit tests
 *
 * Covers how a kit holding an item marked unavailable reads: "Unavailable"
 * in place of "Available", and its real status otherwise.
 *
 * @see {@link file://./kit-status-badge.tsx}
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KitStatusBadge } from "./kit-status-badge";

describe("KitStatusBadge", () => {
  it("reads 'Available' when every item is bookable", () => {
    render(<KitStatusBadge status="AVAILABLE" availableToBook />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("reads 'Unavailable', never 'Available', when an item is marked unavailable", () => {
    render(<KitStatusBadge status="AVAILABLE" availableToBook={false} />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  it("keeps a status that says where the kit is", () => {
    render(<KitStatusBadge status="IN_CUSTODY" availableToBook={false} />);
    expect(screen.getByText("In custody")).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });
});
