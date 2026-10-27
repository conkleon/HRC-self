import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INSTANCE_BRANDING,
  type InstanceBranding,
} from "~/modules/branding/instance-branding";
import AuthLayout from "~/routes/_auth+/_auth";

let branding: InstanceBranding = DEFAULT_INSTANCE_BRANDING;

// why: branding comes from root loader data, which this isolated render does not have
vi.mock("~/hooks/use-instance-branding", () => ({
  useInstanceBranding: () => branding,
}));

/** Renders the auth layout around a login page that provides a title. */
async function renderAuth() {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: AuthLayout,
      children: [
        {
          path: "login",
          Component: () => <p>form</p>,
          loader: () => ({ title: "Log in" }),
        },
      ],
    },
  ]);
  render(<Stub initialEntries={["/login"]} />);
  await screen.findByText("form");
}

beforeEach(() => {
  branding = DEFAULT_INSTANCE_BRANDING;
});

describe("auth layout branding", () => {
  it("shows the Shelf painting and a link to the help site by default", async () => {
    await renderAuth();
    expect(screen.getByAltText(/John Singer Sargent/i)).toHaveAttribute(
      "src",
      "/static/images/auth-cover.webp"
    );
    // The test env sets HELP_SITE_URL to https://www.shelf.nu
    expect(
      screen.getByRole("link", { name: "www.shelf.nu" })
    ).toBeInTheDocument();
  });

  it("shows the custom background without the help site link", async () => {
    branding = {
      ...DEFAULT_INSTANCE_BRANDING,
      loginBgUrl: "/branding/login-bg.jpg",
    };
    await renderAuth();
    expect(document.querySelector("aside img")).toHaveAttribute(
      "src",
      "/branding/login-bg.jpg"
    );
    expect(
      screen.queryByRole("link", { name: "www.shelf.nu" })
    ).not.toBeInTheDocument();
  });

  it("shows the instance name under the logo when set", async () => {
    branding = { ...DEFAULT_INSTANCE_BRANDING, instanceName: "HRC Patras" };
    await renderAuth();
    expect(screen.getByText("HRC Patras")).toBeInTheDocument();
  });
});
