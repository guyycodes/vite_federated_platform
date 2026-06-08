/**
 * Shown when the federated module can't be loaded (remote down / not deployed).
 * The shell stays up; this is the graceful degradation for a missing remote.
 */
export function ModuleUnavailable() {
  return (
    <div className="panel">
      <h2>Module unavailable</h2>
      <p className="muted">
        The SOURCING module couldn&apos;t be loaded. In local dev, start the remote
        (<code>npm run dev:web</code> in <code>api_event_driven_system</code>, serving{" "}
        <code>http://localhost:5173/remoteEntry.js</code>). In the cloud, check that the
        remote is published under <code>/modules/sourcing/</code>.
      </p>
    </div>
  );
}
