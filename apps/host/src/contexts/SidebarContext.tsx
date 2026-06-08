import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * SidebarContext — ephemeral presentational state for the dashboard chrome
 * (mirrors Widget-SaaS SidebarContext). Single responsibility: is the sidebar
 * expanded / open-on-mobile. Consumed by AppSidebar, AppHeader, Backdrop. Domain
 * state lives elsewhere (SharedContextModel); page chrome in ShellModel.
 */
export interface SidebarState {
  isExpanded: boolean;
  isMobileOpen: boolean;
  isMobile: boolean;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within <SidebarProvider>");
  return ctx;
}

const MOBILE_BREAKPOINT = 1024;

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setIsMobileOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const value: SidebarState = {
    isExpanded,
    isMobileOpen,
    isMobile,
    toggleSidebar: () => setIsExpanded((v) => !v),
    toggleMobileSidebar: () => setIsMobileOpen((v) => !v),
    closeMobile: () => setIsMobileOpen(false),
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
