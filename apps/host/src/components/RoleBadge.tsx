import { observer } from "mobx-react-lite";
import { useSharedContext } from "../contexts/SharedContextProvider";

/**
 * Visible RBAC feedback — shows the principal resolved from the Clerk session and
 * which capability the state model granted (the view RoleShell renders). Lets you
 * confirm at a glance that the role was picked up correctly.
 */
export const RoleBadge = observer(function RoleBadge() {
  const { user, capabilities, isReady } = useSharedContext();
  if (!isReady || !user.userId) return null;

  const principal =
    user.accountType === "gba"
      ? `gba · ${user.country ?? "?"}`
      : `${user.accountType ?? "—"} · ${user.role ?? "no role"}`;

  const view = capabilities.dashboard
    ? "dashboard"
    : capabilities.modules
      ? "modules"
      : "no access";

  return (
    <span className="badge" title={`userId: ${user.userId}`}>
      {principal} → <strong>{view}</strong>
    </span>
  );
});
