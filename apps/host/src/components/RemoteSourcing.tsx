import { lazy, useEffect, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useAuth } from "@clerk/clerk-react";
import type { PlatformContext } from "sourcing/SourcingModule";
import { remoteRegistryService } from "../services/remoteRegistryService";
import { sharedContextService } from "../services/sharedContextService";
import { shellModel } from "../services/models/ShellModel";
import { useSharedContext } from "../contexts/SharedContextProvider";

/**
 * RemoteSourcing — mounts the federated SOURCING module (gba / omni-user view).
 *
 *   - Loaded dynamically via the registry (registerRemotes → loadRemote), so the
 *     remote can live anywhere; the host build doesn't hardcode its location.
 *   - The remote is Clerk-AGNOSTIC: the host passes a `getToken` prop (from its
 *     own Clerk session) + the adapter URL. The remote authenticates with the
 *     host's identity without importing Clerk.
 *   - Separately, the host reads the remote's exposed MobX ring buffer
 *     (`sourcing/sourcingModel`) into the shared context via the registry mirror.
 *
 * STATE FLOW — bi-directional:
 *   module → platform: sourcingModel ──mirrorRemoteModel/autorun──▶ sharedContextModel.
 *   platform → module: this component is an `observer` that reads the shared
 *     context and forwards it as the reactive `platformContext` prop. Any change
 *     to `sharedContextModel` (capabilities, tenant scope, principal) re-renders
 *     this component and pushes a fresh prop into the remote, which sinks it into
 *     its OWN MobX model — so the remote re-renders reactively. The prop shape is
 *     structural (PlatformContext from remotes.d.ts), keeping the remote
 *     platform-agnostic (no host-type import across the boundary).
 */
const ADAPTER = (import.meta.env.VITE_ADAPTER_URL as string | undefined) ?? "http://localhost:8080";

/** Federation name of this module — the same key used for its named state model. */
const MODULE = "sourcing";

const LazySourcingModule = lazy(() =>
  remoteRegistryService.load<typeof import("sourcing/SourcingModule")>(MODULE, "./SourcingModule"),
);

export const RemoteSourcing = observer(function RemoteSourcing() {
  const { getToken } = useAuth();
  const { user, capabilities, visibleTenants } = useSharedContext();

  // Set the page chrome (the federated module can later override this via an
  // injected shell port — the SOLID seam).
  useEffect(() => {
    shellModel.setPage("Sourcing", "sourcing module");
  }, []);

  // Mirror the remote's ring buffer into the platform's shared context.
  useEffect(() => {
    let dispose: (() => void) | undefined;
    remoteRegistryService
      .load<typeof import("sourcing/sourcingModel")>(MODULE, "./sourcingModel")
      .then((m) => {
        dispose = sharedContextService.mirrorRemoteModel(MODULE, m.sourcingModel);
      })
      .catch(() => {
        /* remote model unavailable — restore/SSE path still feeds shared context */
      });
    return () => dispose?.();
  }, []);

  const tokenGetter = useMemo(() => () => getToken(), [getToken]);

  // Reactive platform → module snapshot. Recomputed on any observed change
  // (capabilities/visibleTenants/user are read off the shared context, itself an
  // observer of sharedContextModel), so the remote always sees current state.
  const platformContext: PlatformContext = useMemo(
    () => ({
      capabilities,
      visibleTenants,
      user: {
        userId: user.userId,
        tenant: user.tenant,
        ...(user.accountType ? { accountType: user.accountType } : {}),
        ...(user.role ? { role: user.role } : {}),
        ...(user.country ? { country: user.country } : {}),
      },
    }),
    [capabilities, visibleTenants, user],
  );

  return (
    <LazySourcingModule getToken={tokenGetter} apiBaseUrl={ADAPTER} platformContext={platformContext} />
  );
});
