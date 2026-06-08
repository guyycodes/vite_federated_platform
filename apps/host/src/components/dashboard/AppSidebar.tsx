import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useSidebar } from "../../contexts/SidebarContext";
import { useSharedContext } from "../../contexts/SharedContextProvider";
import {
  remoteRegistryService,
  type RemoteManifestEntry,
} from "../../services/remoteRegistryService";

/**
 * AppSidebar — left nav. An `observer`, so the nav reacts to the state model:
 * dashboard principals (super_admin/VP) get the Dashboard section; module
 * principals (gba/omni-user) get one item per remote in the registry manifest.
 * This is the "RBAC-driven, reactive wrapper" — change role → nav changes.
 */
const cn = (...xs: Array<string | false | undefined>) => xs.filter(Boolean).join(" ");

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const AppSidebar = observer(function AppSidebar() {
  const { isExpanded, isMobile, isMobileOpen, closeMobile } = useSidebar();
  const { capabilities, user } = useSharedContext();
  const [remotes, setRemotes] = useState<RemoteManifestEntry[]>([]);

  useEffect(() => {
    remoteRegistryService
      .fetchManifest()
      .then(setRemotes)
      .catch(() => setRemotes([]));
  }, []);

  const open = isMobile ? isMobileOpen : isExpanded;

  const items = capabilities.dashboard
    ? [{ key: "dashboard", label: "Dashboard", glyph: "▣" }]
    : capabilities.modules
      ? remotes.map((r) => ({ key: r.name, label: cap(r.name), glyph: "◧" }))
      : [];

  return (
    <aside
      className={cn("dash-sidebar", open ? "is-open" : "is-collapsed", isMobile && !isMobileOpen && "is-hidden")}
    >
      <div className="dash-brand">{open ? "Platform" : "P"}</div>

      <nav className="dash-nav">
        {items.length === 0 && open && <p className="muted dash-nav-empty">No sections</p>}
        {items.map((it) => (
          // Single-module shell: items are active markers (no client router yet).
          // A new remote in the manifest appears here automatically.
          <div key={it.key} className="dash-nav-item is-active" title={it.label}>
            <span className="dash-nav-glyph">{it.glyph}</span>
            {open && <span>{it.label}</span>}
          </div>
        ))}
      </nav>

      <div className="dash-sidebar-footer">
        {open && user.userId && (
          <span className="muted">
            {user.accountType === "gba" ? `gba · ${user.country ?? "?"}` : `${user.accountType ?? "—"} · ${user.role ?? "—"}`}
          </span>
        )}
      </div>

      {isMobile && isMobileOpen && (
        <button className="icon-btn dash-sidebar-close" onClick={closeMobile} aria-label="Close sidebar">
          ✕
        </button>
      )}
    </aside>
  );
});
