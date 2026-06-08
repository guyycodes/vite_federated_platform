import { observer } from "mobx-react-lite";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useSidebar } from "../../contexts/SidebarContext";
import { useShell } from "../../hooks/useShell";
import { useSharedContext } from "../../contexts/SharedContextProvider";
import { RoleBadge } from "../RoleBadge";

/**
 * AppHeader — top bar. An `observer`: the title/subtitle come from ShellModel
 * (what the working area set), and the live "N active" badge from the shared
 * context (module run interactions) — so the wrapper updates reactively.
 *
 * Sign-out does a HARD reload (mirrors LGA's window.location handoff): clerk-js
 * keeps one in-memory `client` per page load, and signing in as a DIFFERENT user
 * on a surviving client triggers Clerk's add/switch-session "client trust" path,
 * which clerk-js can't complete (`needs_client_trust not supported yet`). A full
 * reload re-inits a clean client, so user-switching works.
 */
export const AppHeader = observer(function AppHeader() {
  const { isMobile, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const { signOut } = useClerk();
  const { user } = useUser();
  const shell = useShell();
  const { runCount } = useSharedContext();

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      window.location.reload();
    }
  };

  const initial =
    user?.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() ??
    user?.firstName?.[0]?.toUpperCase() ??
    "U";

  return (
    <header className="dash-header">
      <div className="dash-header-left">
        <button
          className="icon-btn"
          onClick={isMobile ? toggleMobileSidebar : toggleSidebar}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
        <div className="dash-titles">
          <div className="dash-title">{shell.title}</div>
          {shell.subtitle && <div className="muted dash-subtitle">{shell.subtitle}</div>}
        </div>
      </div>

      <div className="dash-header-right">
        {runCount > 0 && <span className="badge">{runCount} active</span>}
        <RoleBadge />
        <span className="dash-avatar" title={user?.primaryEmailAddress?.emailAddress ?? undefined}>
          {initial}
        </span>
        <button className="icon-btn" onClick={handleSignOut} title="Sign out">
          Sign out
        </button>
      </div>
    </header>
  );
});
