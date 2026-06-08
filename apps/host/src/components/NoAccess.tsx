import { observer } from "mobx-react-lite";
import { useSharedContext } from "../contexts/SharedContextProvider";

/**
 * Rendered when a signed-in principal has no capability (no recognized
 * accountType/role in publicMetadata). RBAC is opt-in: an admin assigns the
 * principal's accountType in Clerk before they can see a dashboard or modules.
 */
export const NoAccess = observer(function NoAccess() {
  const { user } = useSharedContext();
  return (
    <div className="panel">
      <h2>No access yet</h2>
      <p className="muted">
        Your account{user.userId ? ` (${user.userId})` : ""} has no assigned role. Ask a platform admin
        to set your <code>accountType</code> in Clerk (<code>omni</code> with a role, or <code>gba</code>{" "}
        with a country).
      </p>
    </div>
  );
});
