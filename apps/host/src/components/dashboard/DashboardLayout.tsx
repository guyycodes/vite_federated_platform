import type { ReactNode } from "react";
import { SidebarProvider, useSidebar } from "../../contexts/SidebarContext";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { Backdrop } from "./Backdrop";

/**
 * DashboardLayout — the shell composition root (mirrors Widget-SaaS
 * DashboardLayout). Sidebar (fixed) + Backdrop + a content column (header + the
 * working-area <main>) offset by the sidebar width. `children` is the working
 * area — RoleShell renders the role's view (Dashboard or a federated module)
 * into it, sized to fill (`.dash-main` scrolls within the visible area).
 */
const SIDEBAR_EXPANDED = 248;
const SIDEBAR_COLLAPSED = 72;

function Shell({ children }: { children: ReactNode }) {
  const { isExpanded, isMobile } = useSidebar();
  const marginLeft = isMobile ? 0 : isExpanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;

  return (
    <div className="dash-root">
      <AppSidebar />
      <Backdrop />
      <div className="dash-content" style={{ marginLeft }}>
        <AppHeader />
        <main className="dash-main">{children}</main>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <Shell>{children}</Shell>
    </SidebarProvider>
  );
}
