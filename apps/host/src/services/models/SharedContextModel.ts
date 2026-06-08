import { makeAutoObservable, runInAction } from "mobx";
import type { StoredEventDTO } from "../../types";
import { ModuleContextModel, type SharedRun } from "./ModuleContextModel";
import {
  capabilitiesFor,
  isGba,
  isSuperAdmin,
  isVP,
  type AppMetadata,
  type Capabilities,
} from "../../lib/authMetadata";

/**
 * SharedContextModel — the platform's MobX single source of truth (the diagram's
 * "Context" oval). It holds:
 *   - the current principal (resolved from Clerk publicMetadata),
 *   - role-derived `capabilities` that DRIVE the dynamic UI,
 *   - a REGISTRY of one ModuleContextModel PER federated module, named after the
 *     module (sourcing, …). Each module's runs live in their own model; the
 *     platform reads each module's exposed ring buffer into its named model.
 *     `runs`/`runCount` aggregate across modules for the dashboard/chrome.
 */
export { CLIENT_RING_BUFFER_SIZE } from "./ModuleContextModel";
export type { SharedRun, RunStatus } from "./ModuleContextModel";
export { ModuleContextModel } from "./ModuleContextModel";

export interface CurrentUser {
  userId: string | null;
  accountType?: "omni" | "gba";
  role?: string;
  country?: string;
  /** Row-scoping tenant: gba → country, omni → org. */
  tenant: string | null;
  metadata: AppMetadata | null;
}

class SharedContextModel {
  currentUser: CurrentUser = { userId: null, tenant: null, metadata: null };
  /** One state model per federated module, keyed by module name (sourcing, …). */
  modules = new Map<string, ModuleContextModel>();
  /** Cross-tenant recent events for the dashboard (super_admin/VP only). */
  recentEvents: StoredEventDTO[] = [];
  lastRestoredAt: number | null = null;
  restored = false;

  constructor() {
    makeAutoObservable(this);
  }

  setUser(input: { userId: string | null; metadata: AppMetadata | null; tenant?: string | null }): void {
    runInAction(() => {
      const md = input.metadata;
      this.currentUser = {
        userId: input.userId,
        metadata: md,
        ...(md?.accountType ? { accountType: md.accountType } : {}),
        ...(md?.accountType === "omni" ? { role: md.role } : {}),
        ...(md?.accountType === "gba" ? { country: md.country } : {}),
        tenant: input.tenant ?? (md?.accountType === "gba" ? md.country : null),
      };
    });
  }

  /** Get-or-create the named module's state model (the per-module registry). */
  module(name: string): ModuleContextModel {
    let m = this.modules.get(name);
    if (!m) {
      m = new ModuleContextModel(name);
      runInAction(() => this.modules.set(name, m!));
    }
    return m;
  }

  setRecentEvents(events: StoredEventDTO[]): void {
    runInAction(() => {
      this.recentEvents = events;
    });
  }

  setRestored(at: number): void {
    runInAction(() => {
      this.lastRestoredAt = at;
      this.restored = true;
    });
  }

  reset(): void {
    runInAction(() => {
      this.currentUser = { userId: null, tenant: null, metadata: null };
      this.modules.clear();
      this.recentEvents = [];
      this.lastRestoredAt = null;
      this.restored = false;
    });
  }

  // ----------------------------- computed (drive the dynamic UI) -----------------------------
  get capabilities(): Capabilities {
    return capabilitiesFor(this.currentUser.metadata);
  }
  get isSuperAdmin(): boolean {
    return isSuperAdmin(this.currentUser.metadata);
  }
  get isVP(): boolean {
    return isVP(this.currentUser.metadata);
  }
  get isGba(): boolean {
    return isGba(this.currentUser.metadata);
  }
  /** Module names currently tracked (sourcing, …). */
  get moduleNames(): string[] {
    return [...this.modules.keys()];
  }
  /** All runs across every module (flattened; each carries its `module`). */
  get runs(): SharedRun[] {
    return [...this.modules.values()].flatMap((m) => m.runs);
  }
  get runCount(): number {
    let n = 0;
    for (const m of this.modules.values()) n += m.runCount;
    return n;
  }
  /** Tenants this principal can see: "*" (platform-wide) for cross-tenant readers, else own tenant. */
  get visibleTenants(): string[] {
    if (this.capabilities.crossTenantRead) return ["*"];
    return this.currentUser.tenant ? [this.currentUser.tenant] : [];
  }
}

/** Shared singleton — services write it, the context reads it. */
export const sharedContextModel = new SharedContextModel();
export type { SharedContextModel };
