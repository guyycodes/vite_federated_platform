import { Suspense } from "react";
import { observer } from "mobx-react-lite";
import { useSharedContext } from "../contexts/SharedContextProvider";
import { Dashboard } from "./Dashboard";
import { RemoteSourcing } from "./RemoteSourcing";
import { RemoteErrorBoundary } from "./RemoteErrorBoundary";
import { ModuleUnavailable } from "./ModuleUnavailable";
import { NoAccess } from "./NoAccess";
import { LoadingShell } from "./LoadingShell";

/**
 * RoleShell — the dynamic, state-model-driven UI (the diagram's is_admin? gate).
 * An `observer` reading the role-derived `capabilities` off the shared context;
 * it re-renders reactively the moment the principal's role resolves. The policy
 * lives in one place (capabilitiesFor), not scattered role checks.
 */
export const RoleShell = observer(function RoleShell() {
  const { isReady, capabilities } = useSharedContext();

  if (!isReady) return <LoadingShell label="Resolving your access…" />;
  if (capabilities.dashboard) return <Dashboard />;
  if (capabilities.modules) {
    return (
      <RemoteErrorBoundary fallback={<ModuleUnavailable />}>
        <Suspense fallback={<LoadingShell label="Loading module…" />}>
          <RemoteSourcing />
        </Suspense>
      </RemoteErrorBoundary>
    );
  }
  return <NoAccess />;
});
