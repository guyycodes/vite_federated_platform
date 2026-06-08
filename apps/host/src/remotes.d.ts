/**
 * Ambient types for the federated remote modules so `loadRemote(...)`, the
 * `import("sourcing/...")` type queries, and the static `sourcing/*` imports
 * typecheck. These mirror what the remote exposes in
 * api_event_driven_system/apps/web/vite.config.ts.
 *
 * NOTE: imports live INSIDE each `declare module` block so this file stays a
 * global script (no top-level import/export), which is what makes the ambient
 * module declarations visible program-wide.
 */
declare module "sourcing/SourcingModule" {
  import type { ComponentType } from "react";
  export interface SourcingModuleProps {
    getToken?: () => Promise<string | null> | string | null;
    apiBaseUrl?: string;
    /** Optional: platform-driven active step (it reads step.* status from the ring buffer). */
    activeStepId?: string;
  }
  const SourcingModule: ComponentType<SourcingModuleProps>;
  export default SourcingModule;
}

declare module "sourcing/sourcingModel" {
  import type { Frame } from "@edn/contracts/frames";
  /** The subset of the remote's MobX SourcingModel the host reads (its ring buffer). */
  export interface RemoteRun {
    correlationId: string;
    frames: Frame[];
    status: string;
  }
  export const sourcingModel: {
    runs: Map<string, RemoteRun>;
  };
}
