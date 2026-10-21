import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INSTANCE_BRANDING,
  type InstanceBranding,
} from "~/modules/branding/instance-branding";
import {
  ShelfFullLogo,
  ShelfMobileLogo,
  ShelfSidebarLogo,
  ShelfSymbolLogo,
} from "./logos";

let branding: InstanceBranding = DEFAULT_INSTANCE_BRANDING;

// why: branding comes from root loader data, which these isolated renders do not have
vi.mock("~/hooks/use-instance-branding", () => ({
  useInstanceBranding: () => branding,
}));

const CUSTOM: InstanceBranding = {
  ...DEFAULT_INSTANCE_BRANDING,
  appName: "HRC Assets",
  iconUrl: "/branding/icon.png",
  hasCustomIcon: true,
};

beforeEach(() => {
  branding = DEFAULT_INSTANCE_BRANDING;
});

describe("logos with default branding", () => {
  it("shows the Shelf images", () => {
    render(<ShelfSidebarLogo minimized={false} />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/static/images/logo-full-color(x2).png"
    );
  });

  it("shows the Shelf symbol on auth screens", () => {
    render(<ShelfSymbolLogo />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/static/images/shelf-symbol.png"
    );
  });
});

describe("logos with a custom icon", () => {
  beforeEach(() => {
    branding = CUSTOM;
  });

  it("shows only the icon in the collapsed sidebar", () => {
    render(<ShelfSidebarLogo minimized />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/branding/icon.png"
    );
    expect(screen.queryByText("HRC Assets")).not.toBeInTheDocument();
  });

  it("shows the icon and app name in the expanded sidebar", () => {
    render(<ShelfSidebarLogo minimized={false} />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/branding/icon.png"
    );
    expect(screen.getByText("HRC Assets")).toBeInTheDocument();
  });

  it("shows the icon and app name in the mobile header and full logo", () => {
    render(
      <>
        <ShelfMobileLogo />
        <ShelfFullLogo />
      </>
    );
    expect(screen.getAllByText("HRC Assets")).toHaveLength(2);
    for (const img of screen.getAllByRole("img")) {
      expect(img).toHaveAttribute("src", "/branding/icon.png");
    }
  });

  it("uses the icon and names it after the app on auth screens", () => {
    render(<ShelfSymbolLogo />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/branding/icon.png");
    expect(img).toHaveAttribute("alt", "HRC Assets logo");
  });
});
