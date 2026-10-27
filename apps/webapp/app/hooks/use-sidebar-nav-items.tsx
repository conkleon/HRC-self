import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  AlarmClockIcon,
  BellIcon,
  BoxesIcon,
  CalendarRangeIcon,
  ChartLineIcon,
  ClipboardCheckIcon,
  FileBarChartIcon,
  HomeIcon,
  MapPinIcon,
  MessageCircleIcon,
  Package,
  PackageOpenIcon,
  QrCodeIcon,
  ScanBarcodeIcon,
  SettingsIcon,
  TagsIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { UpgradeMessage } from "~/components/marketing/upgrade-message";
import When from "~/components/when/when";
import type { loader } from "~/routes/_layout+/_layout";
import { LABEL_STORE_URL } from "~/utils/env";
import { isPersonalOrg } from "~/utils/organization";
import type { AdminArea } from "~/utils/permissions/admin-areas";
import { canSeeAdminArea } from "~/utils/permissions/admin-areas";
import {
  visibleSettingsTabs,
  visibleTeamTabs,
} from "~/utils/permissions/settings-tabs";
import { useCurrentOrganization } from "./use-current-organization";
import { useOrganizationRoles } from "./use-organization-roles";

type BaseNavItem = {
  title: string;
  hidden?: boolean;
  Icon: LucideIcon;
  disabled?: boolean | { reason: ReactNode };
  badge?: {
    show: boolean;
    variant?: "unread";
  };
};

export type ChildNavItem = BaseNavItem & {
  type: "child";
  to: string;
  target?: string;
};

export type ParentNavItem = BaseNavItem & {
  type: "parent";
  children: Omit<ChildNavItem, "type" | "Icon">[];
};

type LabelNavItem = Omit<BaseNavItem, "Icon"> & {
  type: "label";
};

type ButtonNavItem = BaseNavItem & {
  type: "button";
  /**
   * Buttons the sidebar renders with their own component. Matched by id, never
   * by `title`, because titles are translated.
   */
  id?: "updates" | "feedback";
  onClick: () => void;
};

export type NavItem =
  | ChildNavItem
  | ParentNavItem
  | LabelNavItem
  | ButtonNavItem;

/**
 * The sidebar's navigation items for the current member and workspace.
 * Admin areas, Team and Workspace settings show with the matrix grant of the
 * page they open (`admin-areas.ts`, `settings-tabs.ts`); hidden items are
 * removed before the lists are returned.
 *
 * @returns The top and bottom menu items, hidden entries already removed
 */
export function useSidebarNavItems() {
  const { t } = useTranslation();
  const { isAdmin, canUseBookings, subscription, unreadUpdatesCount } =
    useLoaderData<typeof loader>();
  const roles = useOrganizationRoles();
  const currentOrganization = useCurrentOrganization();
  const isPersonalOrganization = isPersonalOrg(currentOrganization);

  /** Each admin area shows with the matrix grant of the page it opens. */
  const can = (area: AdminArea) => canSeeAdminArea({ roles, area });
  const settingsTabs = visibleSettingsTabs({
    roles,
    isPersonalOrg: isPersonalOrganization,
  }).map((tab) => tab.to);
  // The Team entries are listed even in personal workspaces (disabled with an
  // upgrade reason), so their visibility ignores the personal-workspace rule.
  const teamTabsAnyWorkspace = visibleTeamTabs({
    roles,
    isPersonalOrg: false,
  }).map((tab) => tab.to);
  const showTeam = teamTabsAnyWorkspace.length > 0;
  const showWorkspaceSettings = settingsTabs.some((tab) => tab !== "team");

  const bookingDisabled = useMemo(() => {
    if (canUseBookings) {
      return false;
    }

    return {
      reason: (
        <div>
          <h5>{t("nav.useSidebarNavItems.disabled")}</h5>
          <p>{t("nav.useSidebarNavItems.bookingIsAPremiumFeature")}</p>

          <When truthy={!!subscription} fallback={<UpgradeMessage />}>
            <p>{t("nav.useSidebarNavItems.pleaseSwitchToYourTeam")}</p>
          </When>
        </div>
      ),
    };
  }, [canUseBookings, subscription, t]);

  /**
   * Personal workspaces can't invite registered users. Rather than hide the
   * "Users" / "Pending invites" items, we show them disabled with an upgrade
   * reason, mirroring how bookings are surfaced on Personal workspaces.
   */
  const teamInviteDisabled = useMemo(() => {
    if (!isPersonalOrganization) {
      return false;
    }

    return { reason: t("nav.useSidebarNavItems.invitingUsersTeamOnly") };
  }, [isPersonalOrganization, t]);

  const topMenuItems: NavItem[] = [
    {
      type: "child",
      title: t("nav.useSidebarNavItems.adminDashboard"),
      to: "/admin-dashboard/users",
      Icon: ChartLineIcon,
      hidden: !isAdmin,
    },
    {
      type: "label",
      title: t("nav.useSidebarNavItems.assetManagement"),
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.home"),
      to: "/home",
      Icon: HomeIcon,
      hidden: !can("home"),
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.assets"),
      to: "/assets",
      Icon: PackageOpenIcon,
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.kits"),
      to: "/kits",
      Icon: Package,
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.categories"),
      to: "/categories",
      Icon: BoxesIcon,
      hidden: !can("categories"),
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.tags"),
      to: "/tags",
      Icon: TagsIcon,
      hidden: !can("tags"),
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.locations"),
      to: "/locations",
      Icon: MapPinIcon,
      hidden: !can("locations"),
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.audits"),
      to: "/audits",
      Icon: ClipboardCheckIcon,
      hidden: !can("audits"),
    },
    {
      type: "parent",
      title: t("nav.useSidebarNavItems.bookings"),
      Icon: CalendarRangeIcon,
      disabled: bookingDisabled,
      children: [
        {
          title: t("nav.useSidebarNavItems.viewBookings"),
          to: "/bookings",
          disabled: bookingDisabled,
        },
        {
          title: t("nav.useSidebarNavItems.calendar"),
          to: "/calendar",
          disabled: bookingDisabled,
        },
      ],
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.reminders"),
      Icon: AlarmClockIcon,
      hidden: !can("reminders"),
      to: "/reminders",
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.reports"),
      Icon: FileBarChartIcon,
      hidden: !can("reports"),
      to: "/reports",
    },
    {
      type: "label",
      title: t("nav.useSidebarNavItems.organization"),
      hidden: !(showTeam || showWorkspaceSettings),
    },
    {
      type: "parent",
      title: t("nav.useSidebarNavItems.team"),
      Icon: UsersRoundIcon,
      hidden: !showTeam,
      children: [
        {
          title: t("nav.useSidebarNavItems.users"),
          to: "/settings/team/users",
          disabled: teamInviteDisabled,
          hidden: !teamTabsAnyWorkspace.includes("users"),
        },
        {
          title: t("nav.useSidebarNavItems.pendingInvites"),
          to: "/settings/team/invites",
          disabled: teamInviteDisabled,
          hidden: !teamTabsAnyWorkspace.includes("invites"),
        },
        {
          title: t("nav.useSidebarNavItems.nonRegisteredMembers"),
          to: "/settings/team/nrm",
          hidden: !teamTabsAnyWorkspace.includes("nrm"),
        },
      ],
    },
    {
      type: "parent",
      title: t("nav.useSidebarNavItems.workspaceSettings"),
      Icon: SettingsIcon,
      hidden: !showWorkspaceSettings,
      children: [
        {
          title: t("nav.useSidebarNavItems.general"),
          to: "/settings/general",
          hidden: !settingsTabs.includes("general"),
        },
        {
          title: t("nav.useSidebarNavItems.bookings"),
          to: "/settings/bookings",
          // Team-workspace only: the tab list already drops it in a personal one.
          hidden: !settingsTabs.includes("bookings"),
        },
        {
          title: t("nav.useSidebarNavItems.customFields"),
          to: "/settings/custom-fields",
          hidden: !settingsTabs.includes("custom-fields"),
        },
        {
          title: t("nav.useSidebarNavItems.assetModels"),
          to: "/settings/asset-models",
          hidden: !settingsTabs.includes("asset-models"),
        },
      ],
    },
  ];

  const bottomMenuItems: NavItem[] = [
    {
      type: "child",
      title: t("nav.useSidebarNavItems.assetLabels"),
      to: LABEL_STORE_URL?.trim() ?? "",
      hidden: !LABEL_STORE_URL?.trim(),
      Icon: QrCodeIcon,
      target: "_blank",
    },
    {
      type: "child",
      title: t("nav.useSidebarNavItems.qrScanner"),
      to: "/scanner",
      Icon: ScanBarcodeIcon,
    },
    {
      type: "button",
      id: "updates",
      title: t("nav.useSidebarNavItems.updates"),
      Icon: BellIcon,
      badge: {
        show: (unreadUpdatesCount || 0) > 0,
        variant: "unread" as const,
      },
      onClick: () => {
        // This will be handled by the sidebar component with popover
      },
    },
    {
      type: "button",
      id: "feedback",
      title: t("nav.useSidebarNavItems.questionsFeedback"),
      Icon: MessageCircleIcon,
      onClick: () => {
        // Handled by FeedbackNavItem in sidebar-nav.tsx
      },
    },
  ];

  return {
    topMenuItems: removeHiddenNavItems(topMenuItems),
    bottomMenuItems: removeHiddenNavItems(bottomMenuItems),
  };
}

function removeHiddenNavItems(navItems: NavItem[]) {
  return navItems
    .filter((item) => !item.hidden)
    .map((item) => {
      if (item.type === "parent") {
        return {
          ...item,
          children: item.children.filter((child) => !child.hidden),
        };
      }

      return item;
    });
}
