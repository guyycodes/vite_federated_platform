import { createContext, useContext, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import {
  sharedContextModel,
  type CurrentUser,
  type SharedRun,
} from "../services/models/SharedContextModel";
import { useSharedContextFlow } from "../hooks/useSharedContext-flow";
import type { Capabilities } from "../lib/authMetadata";
import type { StoredEventDTO } from "../types";

/**
 * SharedContextProvider — wraps the MobX SharedContextModel in a React context
 * (mirrors the remote's StateContext). The provider is an `observer`, so it
 * re-renders on observed change and hands components a reactive value. Components
 * consume THIS via `useSharedContext()` — never the model/services directly:
 *
 *   Components → Contexts ↔ Hooks → Services → Models
 *
 * The Clerk → model bridge lives in `useSharedContextFlow` (mockable in tests),
 * keeping this provider free of any Clerk import.
 */
export interface SharedContextValue {
  user: CurrentUser;
  capabilities: Capabilities;
  visibleTenants: string[];
  /** All runs across every module (flattened; each carries its `module`). */
  runs: SharedRun[];
  /** Module names currently tracked (one model per module). */
  moduleNames: string[];
  recentEvents: StoredEventDTO[];
  runCount: number;
  isReady: boolean;
  refreshRecent: () => Promise<void>;
}

const SharedContext = createContext<SharedContextValue | null>(null);

export function useSharedContext(): SharedContextValue {
  const ctx = useContext(SharedContext);
  if (!ctx) throw new Error("useSharedContext must be used within <SharedContextProvider>");
  return ctx;
}

export const SharedContextProvider = observer(function SharedContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isReady, refreshRecent } = useSharedContextFlow();

  const value: SharedContextValue = {
    user: sharedContextModel.currentUser,
    capabilities: sharedContextModel.capabilities,
    visibleTenants: sharedContextModel.visibleTenants,
    runs: sharedContextModel.runs,
    moduleNames: sharedContextModel.moduleNames,
    recentEvents: sharedContextModel.recentEvents,
    runCount: sharedContextModel.runCount,
    isReady,
    refreshRecent,
  };

  return <SharedContext.Provider value={value}>{children}</SharedContext.Provider>;
});
