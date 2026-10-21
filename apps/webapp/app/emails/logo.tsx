import { Heading, Img } from "@react-email/components";
import { config } from "~/config/shelf.config";
import { getInstanceBranding } from "~/modules/branding/instance-branding.server";
import { SERVER_URL } from "~/utils/env";

/**
 * Logo at the top of every email: the instance's icon and app name when an
 * operator configured an icon, otherwise Shelf's full logo.
 */
export function LogoForEmail() {
  const { logoPath } = config;
  const { hasCustomIcon, iconUrl, appName } = getInstanceBranding();

  if (hasCustomIcon) {
    return (
      <div style={{ margin: "0 auto", display: "flex", alignItems: "center" }}>
        <Img
          src={`${SERVER_URL}${iconUrl}`}
          alt={`${appName} logo`}
          width="32"
          height="32"
          style={{ marginRight: "8px", width: "32px", height: "32px" }}
        />
        <Heading
          as="h1"
          style={{
            color: "#101828",
            fontWeight: "600",
            fontSize: "20px",
            margin: "0",
          }}
        >
          {appName}
        </Heading>
      </div>
    );
  }

  return (
    <div style={{ margin: "0 auto", display: "flex" }}>
      <Img
        src={`${SERVER_URL}/static/images/logo-full-color(x2).png`}
        alt={`${appName} logo`}
        width="auto"
        height="32"
        style={{ marginRight: "6px", width: "auto", height: "32px" }}
      />
      {logoPath?.fullLogo ? null : (
        <Heading
          as="h1"
          style={{
            color: "#101828",
            fontWeight: "600",
            margin: "0",
          }}
        >
          shelf
        </Heading>
      )}
    </div>
  );
}
