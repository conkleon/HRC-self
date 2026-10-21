import { ShelfTypography } from "~/components/icons/library";
import { config } from "~/config/shelf.config";
import { useInstanceBranding } from "~/hooks/use-instance-branding";
import { tw } from "~/utils/tw";
import When from "../when/when";

/**
 * The instance's own icon next to its app name, used wherever Shelf would show
 * its full logo once an operator has supplied `icon.*`.
 *
 * @param props.iconClassName - Size and spacing of the icon
 * @param props.showName - Whether to render the app name beside the icon
 */
const InstanceLockup = ({
  iconClassName,
  showName = true,
}: {
  iconClassName?: string;
  showName?: boolean;
}) => {
  const { iconUrl, appName } = useInstanceBranding();
  return (
    <span className="inline-flex h-full items-center">
      <img src={iconUrl} alt={`${appName} logo`} className={iconClassName} />
      {showName ? (
        <span className="logo-text truncate font-semibold text-gray-900">
          {appName}
        </span>
      ) : null}
    </span>
  );
};

/**
 * Logo shown in the sidebar
 * If a custom logo is used, we dynamically show that or the symbol depending on {optimisticMinimizedSidebar}
 */
export const ShelfSidebarLogo = ({ minimized }: { minimized: boolean }) => {
  const { logoPath } = config;
  const { hasCustomIcon, appName } = useInstanceBranding();

  if (hasCustomIcon) {
    return (
      <InstanceLockup
        iconClassName="mx-1.5 inline h-[32px] transition duration-150 ease-linear"
        showName={!minimized}
      />
    );
  }

  /** If a custom logo is used, we just use that instead of doing the dynamic shelf typograpy */
  if (logoPath) {
    return minimized ? (
      <img
        src={logoPath.symbol}
        alt={`${appName} logo`}
        className="mx-1.5 inline h-[32px] transition duration-150 ease-linear"
      />
    ) : (
      <img
        src={logoPath.fullLogo}
        alt={`${appName} logo`}
        className="mx-1.5 inline h-[32px] transition duration-150 ease-linear"
      />
    );
  }

  return (
    <>
      <img
        src="/static/images/shelf-symbol.png"
        alt={`${appName} logo`}
        className="mx-1.5 inline h-[32px]"
      />
      <When truthy={!minimized}>
        <span className="logo-text transition duration-150 ease-linear">
          <ShelfTypography />
        </span>
      </When>
    </>
  );
};

/**
 * Logo shown in the header for mobile screen sizes
 */
export const ShelfMobileLogo = () => {
  const { logoPath } = config;
  const { hasCustomIcon, appName } = useInstanceBranding();

  if (hasCustomIcon) {
    return <InstanceLockup iconClassName="mr-1.5 h-full" />;
  }

  if (logoPath) {
    return (
      <img src={logoPath.fullLogo} alt={`${appName} logo`} className="h-full" />
    );
  }

  return (
    <img
      src="/static/images/logo-full-color(x2).png"
      alt="logo"
      className="h-full"
    />
  );
};

/**
 * Square symbol, shown above the auth and onboarding forms
 */
export const ShelfSymbolLogo = ({ className }: { className?: string }) => {
  const { logoPath } = config;
  const { hasCustomIcon, iconUrl, appName } = useInstanceBranding();
  const classes = tw("mx-auto mb-2 size-12", className);

  if (hasCustomIcon) {
    return (
      <img
        src={iconUrl}
        alt={`${appName} logo`}
        className={tw(classes, "object-contain")}
      />
    );
  }

  if (logoPath) {
    return (
      <img src={logoPath.symbol} alt={`${appName} logo`} className={classes} />
    );
  }

  return (
    <img src="/static/images/shelf-symbol.png" alt="logo" className={classes} />
  );
};

/**
 * Full logo
 */
export const ShelfFullLogo = ({ className }: { className?: string }) => {
  const { logoPath } = config;
  const { hasCustomIcon, appName } = useInstanceBranding();
  const classes = tw(className);

  if (hasCustomIcon) {
    return <InstanceLockup iconClassName={tw("mr-1.5", classes)} />;
  }

  if (logoPath) {
    return (
      <img
        src={logoPath.fullLogo}
        alt={`${appName} logo`}
        className={classes}
      />
    );
  }

  return (
    <img
      src="/static/images/logo-full-color(x2).png"
      alt="logo"
      className={classes}
    />
  );
};
