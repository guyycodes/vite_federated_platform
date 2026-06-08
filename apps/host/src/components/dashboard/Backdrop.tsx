import { useSidebar } from "../../contexts/SidebarContext";

/** Semi-transparent overlay behind the sidebar on mobile; tap to close. */
export function Backdrop() {
  const { isMobile, isMobileOpen, closeMobile } = useSidebar();
  if (!isMobile || !isMobileOpen) return null;
  return <div className="dash-backdrop" onClick={closeMobile} aria-hidden />;
}
