import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { useSharedContext } from "./contexts/SharedContextProvider";
import { RoleShell } from "./components/RoleShell";
import { DashboardLayout } from "./components/dashboard/DashboardLayout";
import { FullScreenLoader } from "./components/FullScreenLoader";

/**
 * App — the auth boundary.
 *
 * Signed out: render Clerk's full <SignIn /> component inline (mirrors LGA's
 * dedicated sign-in surface), NOT <SignInButton mode="modal">. The modal mounts
 * <SignIn> in a transient portal where Clerk's bot-protection / client-trust
 * (CAPTCHA) step has no stable container, which leaves clerk-js stuck in
 * `needs_client_trust`. The inline component gives that step a real mount.
 * `routing="hash"` keeps it router-free for this SPA; once signed in the
 * <SignedIn> boundary swaps to the dashboard automatically.
 *
 * Signed in: DashboardLayout (sidebar + top bar) wraps RoleShell, which renders
 * the role's view (Dashboard or a federated module) into the working area.
 */
export default function App() {
  const { isReady } = useSharedContext();

  // Rehydration gate: hold a full-screen loader until Clerk has loaded AND the
  // shared context has hydrated (`isReady` flips true only after both — signed-out
  // resolves fast; signed-in waits for restoreOnLoad). Prevents the staged pop-in
  // / role flash on refresh, sign-in, and sign-out. Everything below is post-hydration.
  if (!isReady) return <FullScreenLoader label="Loading platform…" />;

  return (
    <>
      <SignedOut>
        <div className="app">
          <main className="app-main">
            <div className="panel centered">
              <h2>Sign in to continue</h2>
              <p className="muted">
                The platform owns authentication; federated modules consume your session.
              </p>
              <div className="signin-mount">
                <SignIn routing="hash" fallbackRedirectUrl="/" signUpUrl="#" />
              </div>
            </div>
          </main>
        </div>
      </SignedOut>

      <SignedIn>
        <DashboardLayout>
          <RoleShell />
        </DashboardLayout>
      </SignedIn>
    </>
  );
}
