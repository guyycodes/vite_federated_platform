import { useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { readPublicMetadata } from "../lib/authMetadata";
import { sharedContextModel } from "../services/models/SharedContextModel";
import { sharedContextService } from "../services/sharedContextService";

/**
 * useSharedContextFlow — bridges Clerk → the MobX shared context (mirrors LGA's
 * useAuthFlow). On sign-in it OPTIMISTICALLY seeds the principal from
 * publicMetadata (so the role view renders instantly), binds the token-getter,
 * then runs restoreOnLoad (rebuild persisted runs from /query, then tail SSE).
 *
 * RACE HANDLING — the LGA lesson. React 18 StrictMode double-invokes effects in
 * dev, and Clerk re-fires this effect on every `user` reference change (token
 * refresh, metadata edit, re-render). Without guarding, that's duplicate /query +
 * SSE work and overlapping flows. Two MODULE-scoped guards (module scope survives
 * StrictMode's unmount/remount, unlike a ref or state):
 *   - `flowUserId` → the heavy restore runs ONCE per signed-in user, not on every
 *                    re-fire; on an account switch it tears the old principal down.
 *   - `inFlight`   → collapses genuinely concurrent invocations onto one promise.
 * We also gate on BOTH Clerk surfaces being loaded (auth state AND the user
 * object) so a momentary null user isn't misread as "signed out".
 */
let inFlight: Promise<void> | null = null;
let flowUserId: string | null = null;

function teardown(): void {
  sharedContextService.closeAll();
  sharedContextModel.reset();
  flowUserId = null;
  inFlight = null;
}

export interface SharedContextFlow {
  isReady: boolean;
  refreshRecent: () => Promise<void>;
}

export function useSharedContextFlow(): SharedContextFlow {
  const { isLoaded: authLoaded, isSignedIn, getToken, orgId } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!authLoaded || !userLoaded) return; // wait for BOTH Clerk surfaces

    if (!isSignedIn || !user) {
      if (flowUserId !== null) teardown(); // only on a real sign-out
      setIsReady(true);
      return;
    }

    // Account switch (multi-session): drop the previous principal's runs + streams.
    if (flowUserId !== null && flowUserId !== user.id) teardown();

    // Optimistic seed — cheap; keeps the role view correct if metadata changes.
    const metadata = readPublicMetadata(user.publicMetadata);
    sharedContextModel.setUser({
      userId: user.id,
      metadata,
      tenant: metadata?.accountType === "gba" ? metadata.country : (orgId ?? null),
    });

    const tokenGetter = () => getToken();
    sharedContextService.setTokenGetter(tokenGetter);
    sharedContextService.setUserScope(user.id);

    // Heavy restore: once per user, surviving StrictMode's paired invoke.
    if (flowUserId !== user.id) {
      flowUserId = user.id;
      inFlight = sharedContextService.restoreOnLoad(tokenGetter).finally(() => {
        inFlight = null;
      });
    }
    void (inFlight ?? Promise.resolve()).finally(() => setIsReady(true));
  }, [authLoaded, userLoaded, isSignedIn, user, orgId, getToken]);

  const refreshRecent = useCallback(() => sharedContextService.refreshRecent(), []);

  return { isReady, refreshRecent };
}
