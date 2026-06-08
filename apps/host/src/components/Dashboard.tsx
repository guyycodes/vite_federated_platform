import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useSharedContext } from "../contexts/SharedContextProvider";
import { useShell } from "../hooks/useShell";

/**
 * Dashboard — the super_admin / VP view (the diagram's is_admin? = Yes branch).
 * It does NOT load the federated remote; it reads the shared context and the
 * cross-tenant `/query` the backend serves unscoped for these principals.
 */
export const Dashboard = observer(function Dashboard() {
  const { user, capabilities, visibleTenants, runs, moduleNames, recentEvents, refreshRecent } =
    useSharedContext();
  const shell = useShell();

  useEffect(() => {
    shell.setPage("Dashboard", "Cross-tenant overview");
    void refreshRecent();
  }, [shell, refreshRecent]);

  return (
    <div className="panel">
      <h2>Platform dashboard</h2>
      <p className="muted">
        {user.role === "super_admin" ? "Super Admin" : "VP"} · cross-tenant read{" "}
        {capabilities.crossTenantRead ? "enabled" : "off"} · tenants: {visibleTenants.join(", ")}
      </p>

      <section>
        <h3>
          Tracked runs ({runs.length}){moduleNames.length > 0 ? ` · modules: ${moduleNames.join(", ")}` : ""}
        </h3>
        {runs.length === 0 ? (
          <p className="muted">No tracked runs.</p>
        ) : (
          <ul className="list">
            {runs.map((r) => (
              <li key={r.correlationId}>
                <code>{r.module}</code> · <code>{r.correlationId.slice(0, 8)}</code> · {r.status} ·{" "}
                {r.frames.length} frames
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="row">
          <h3>Recent platform events</h3>
          <button onClick={() => void refreshRecent()}>Refresh</button>
        </div>
        {recentEvents.length === 0 ? (
          <p className="muted">No events visible.</p>
        ) : (
          <ul className="list">
            {recentEvents.map((e) => (
              <li key={e.id}>
                <code>{e.eventType}</code> · {e.correlationId.slice(0, 8)} ·{" "}
                {new Date(e.receivedAt).toLocaleTimeString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
});
