import { autorun, untracked } from "mobx";
import type { Frame, FrameType } from "../types";
import { queryByCorrelation, queryRecent, rowToFrame, streamUrl } from "./apiClient";
import { sharedContextModel } from "./models/SharedContextModel";

/**
 * sharedContextService — SUBSCRIBE + RESTORE for the platform's shared context,
 * MODULE-AWARE: every run is namespaced by its owning module so each module's
 * state lands in its own ModuleContextModel (the per-module registry).
 *
 * Host-side of the remote's eventStreamService F8/Gap-3 pattern: reconcile the
 * durable timeline from `/query` FIRST, then tail live; dedup-by-eventId makes
 * the overlap idempotent. Two feed paths:
 *   1. MIRROR (live, in-session) — `mirrorRemoteModel(name, remote)` autoruns over
 *      a module's exposed MobX ring buffer and copies frames into module(name).
 *   2. RESTORE + OWN SSE — `restoreOnLoad` rebuilds persisted runs (grouped by
 *      module) from `/query`, then tails each over the host's own EventSource.
 */

const STORAGE_PREFIX = "platform.sharedContext.runs";

/** Frame event types the SSE stream emits (mirrors the remote's eventStreamService). */
const FRAME_EVENTS: FrameType[] = [
  "request.accepted",
  "vendor.requested",
  "vendor.responded",
  "vendor.failed",
  "run.completed",
  "run.failed",
  "resync",
];

type TokenGetter = () => Promise<string | null>;
/** Persisted shape: { [moduleName]: correlationId[] } — restore needs the module. */
type PersistedRuns = Record<string, string[]>;

class SharedContextService {
  /** Live SSE connections keyed by correlationId (globally unique). */
  private readonly sources = new Map<string, EventSource>();
  /** One mirror disposer per module. */
  private readonly mirrorDisposers = new Map<string, () => void>();
  private getToken: TokenGetter = async () => null;
  /** Persistence is scoped per Clerk user so a 2nd account can't restore another's runs. */
  private userKey = "anon";

  setTokenGetter(fn: TokenGetter): void {
    this.getToken = fn;
  }

  setUserScope(userId: string | null): void {
    this.userKey = userId ?? "anon";
  }

  private get storageKey(): string {
    return `${STORAGE_PREFIX}.${this.userKey}`;
  }

  // ------------------------------ persistence ------------------------------
  loadPersisted(): PersistedRuns {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const out: PersistedRuns = {};
      for (const [name, cids] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(cids)) out[name] = cids.filter((x): x is string => typeof x === "string");
      }
      return out;
    } catch {
      return {};
    }
  }
  persist(): void {
    try {
      const out: PersistedRuns = {};
      for (const [name, m] of sharedContextModel.modules) out[name] = m.activeCorrelationIds;
      localStorage.setItem(this.storageKey, JSON.stringify(out));
    } catch {
      /* storage disabled — non-fatal */
    }
  }
  clearPersisted(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* non-fatal */
    }
  }

  // --------------------------- restore (reload) ----------------------------
  /** Rebuild persisted runs (per module) from the durable timeline, then tail each. */
  async restoreOnLoad(getToken: TokenGetter): Promise<void> {
    this.setTokenGetter(getToken);
    for (const [moduleName, cids] of Object.entries(this.loadPersisted())) {
      for (const cid of cids) {
        sharedContextModel.module(moduleName).upsertRun(cid);
        await this.hydrate(moduleName, cid);
        this.subscribe(moduleName, cid);
      }
    }
    sharedContextModel.setRestored(Date.now());
  }

  /** Reconcile a run's timeline from Postgres (tenant-scoped, authed) into its module. */
  private async hydrate(moduleName: string, cid: string): Promise<void> {
    try {
      const token = await this.getToken();
      const rows = await queryByCorrelation(cid, token);
      for (const row of rows) {
        const frame = rowToFrame(cid, row);
        if (frame) sharedContextModel.module(moduleName).appendFrame(cid, frame);
      }
    } catch {
      /* best-effort; live SSE still drives the timeline */
    }
  }

  // ----------------------- live SSE tail (authenticated) -------------------
  subscribe(moduleName: string, cid: string): void {
    if (this.sources.has(cid)) return;
    void this.connect(moduleName, cid);
  }

  private async connect(moduleName: string, cid: string): Promise<void> {
    if (typeof EventSource === "undefined") return; // test/SSR guard
    const token = await this.getToken();
    const es = new EventSource(streamUrl(cid, token));
    this.sources.set(cid, es);
    es.onopen = () => void this.hydrate(moduleName, cid);
    for (const type of FRAME_EVENTS) {
      es.addEventListener(type, (e) => {
        let frame: Frame;
        try {
          frame = JSON.parse((e as MessageEvent).data) as Frame;
        } catch {
          return;
        }
        sharedContextModel.module(moduleName).appendFrame(cid, frame);
        if (type === "run.completed" || type === "run.failed") this.close(cid);
      });
    }
  }

  close(cid: string): void {
    const es = this.sources.get(cid);
    if (es) {
      es.close();
      this.sources.delete(cid);
    }
  }

  // --------------------------- dashboard read ------------------------------
  /** Recent cross-tenant events (backend serves unscoped for super_admin/VP). */
  async refreshRecent(): Promise<void> {
    try {
      const token = await this.getToken();
      sharedContextModel.setRecentEvents(await queryRecent(token));
    } catch {
      sharedContextModel.setRecentEvents([]);
    }
  }

  // ------------ mirror a module's ring buffer into its named model ----------
  /**
   * autorun over a module's exposed MobX runs → copy frames into module(name).
   * Host writes are wrapped in `untracked` so the reaction depends ONLY on the
   * remote's observables (no read-write feedback loop). One mirror per module.
   */
  mirrorRemoteModel(
    moduleName: string,
    remote: { runs: Map<string, { frames: Frame[]; status: string }> },
  ): () => void {
    this.mirrorDisposers.get(moduleName)?.();
    const dispose = autorun(() => {
      // READ remote observables (tracked) → snapshot.
      const snapshot = [...remote.runs.entries()].map(
        ([cid, run]) => [cid, run.frames.slice(), run.status] as const,
      );
      // WRITE host model (untracked).
      untracked(() => {
        const model = sharedContextModel.module(moduleName);
        for (const [cid, frames, status] of snapshot) {
          const isNew = !model.activeRuns.has(cid);
          for (const f of frames) model.appendFrame(cid, f);
          if (status === "completed" || status === "failed") {
            model.upsertRun(cid, { status });
          }
          if (isNew) this.persist();
        }
      });
    });
    this.mirrorDisposers.set(moduleName, dispose);
    return dispose;
  }

  // ------------ platform → remote (the reverse leg, bi-directional) ---------
  /**
   * The reverse direction (platform → module) is implemented via REACTIVE PROPS,
   * not a service-level autorun: `RemoteSourcing` is an `observer` that reads the
   * shared context and forwards it as the remote's `platformContext` prop, which
   * the remote sinks into its own MobX model. That keeps the remote
   * platform-agnostic (no host-type import) and avoids a cross-boundary
   * read-write autorun pair here.
   *
   * If a future module needs platform state OUTSIDE React's render tree, add an
   * autorun counterpart to `mirrorRemoteModel` here that pushes into a setter the
   * remote exposes — wrapping the WRITE in `untracked()` to avoid a feedback loop.
   */

  // ------------------------------ teardown ---------------------------------
  closeAll(): void {
    for (const cid of [...this.sources.keys()]) this.close(cid);
    for (const dispose of this.mirrorDisposers.values()) dispose();
    this.mirrorDisposers.clear();
  }
}

export const sharedContextService = new SharedContextService();
