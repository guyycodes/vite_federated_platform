import { lazy, useEffect, useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import { remoteRegistryService } from "../services/remoteRegistryService";
import { sharedContextService } from "../services/sharedContextService";
import { shellModel } from "../services/models/ShellModel";

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
 */
const ADAPTER = (import.meta.env.VITE_ADAPTER_URL as string | undefined) ?? "http://localhost:8080";

/** Federation name of this module — the same key used for its named state model. */
const MODULE = "sourcing";

const LazySourcingModule = lazy(() =>
  remoteRegistryService.load<typeof import("sourcing/SourcingModule")>(MODULE, "./SourcingModule"),
);

export function RemoteSourcing() {
  const { getToken } = useAuth();

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

  return <LazySourcingModule getToken={tokenGetter} apiBaseUrl={ADAPTER} />;
}
