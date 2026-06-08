import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { SharedContextProvider } from "./contexts/SharedContextProvider";
import App from "./App";
import "./index.css";

/**
 * The HOST is the ONLY place ClerkProvider mounts. The federated remote consumes
 * the session via a getToken prop (it never mounts its own Clerk). SharedContext
 * wraps App so the role-driven UI has the model available everywhere.
 */
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function Root() {
  if (!publishableKey) {
    return (
      <div className="app">
        <main className="app-main">
          <div className="panel centered">
            <h2>Missing Clerk key</h2>
            <p className="muted">
              Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>apps/host/.env.local</code> (see{" "}
              <code>.env.example</code>), then restart the dev server.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <SharedContextProvider>
        <App />
      </SharedContextProvider>
    </ClerkProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
