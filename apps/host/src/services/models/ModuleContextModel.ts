import { makeAutoObservable, runInAction } from "mobx";
import type { Frame } from "../../types";

/**
 * ModuleContextModel — ONE platform-side state model PER federated module, named
 * after the module (e.g. "sourcing"). It mirrors that module's exposed MobX ring
 * buffer (and the durable /query timeline) into a bounded, eventId-deduped set of
 * runs. SharedContextModel holds a registry of these (one per module), so when we
 * add more modules each gets its own named model instead of everything piling
 * into one flat map.
 *
 * Dedup is by the stable `eventId` (never server `seq`) — identical to the
 * remote's appendFrame, so a redelivered frame is idempotent across the boundary.
 */

/** Matches the remote's CLIENT_RING_BUFFER_SIZE so the platform view can't outgrow the source. */
export const CLIENT_RING_BUFFER_SIZE = 200;

export type RunStatus = "pending" | "completed" | "failed";

export interface SharedRun {
  correlationId: string;
  /** Which federated module this run belongs to. */
  module: string;
  /** Client-side ring buffer of timeline frames (bounded, FIFO). */
  frames: Frame[];
  status: RunStatus;
}

export class ModuleContextModel {
  readonly name: string;
  activeRuns = new Map<string, SharedRun>();

  constructor(name: string) {
    this.name = name;
    makeAutoObservable(this);
  }

  /** Push a timeline frame into the run's bounded ring buffer (dedup by eventId + FIFO). */
  appendFrame(correlationId: string, frame: Frame): void {
    runInAction(() => {
      if (!this.activeRuns.has(correlationId)) {
        this.activeRuns.set(correlationId, {
          correlationId,
          module: this.name,
          frames: [],
          status: "pending",
        });
      }
      // Operate on the OBSERVABLE proxy stored in the map (not a local object) —
      // MobX deep-observes on set(), so mutating a pre-set local would be lost.
      const run = this.activeRuns.get(correlationId)!;
      const dupe = frame.eventId
        ? run.frames.some((f) => f.eventId === frame.eventId)
        : frame.seq !== null && run.frames.some((f) => f.seq === frame.seq);
      if (dupe) return;
      run.frames.push(frame);
      while (run.frames.length > CLIENT_RING_BUFFER_SIZE) run.frames.shift();
      if (frame.type === "run.completed") run.status = "completed";
      if (frame.type === "run.failed") run.status = "failed";
    });
  }

  /** Ensure a run exists / patch its status (resync + mirror paths). */
  upsertRun(correlationId: string, patch: Partial<Pick<SharedRun, "status">> = {}): void {
    runInAction(() => {
      if (!this.activeRuns.has(correlationId)) {
        this.activeRuns.set(correlationId, {
          correlationId,
          module: this.name,
          frames: [],
          status: "pending",
        });
      }
      const run = this.activeRuns.get(correlationId)!;
      if (patch.status) run.status = patch.status;
    });
  }

  reset(): void {
    runInAction(() => this.activeRuns.clear());
  }

  get runs(): SharedRun[] {
    return [...this.activeRuns.values()];
  }
  get activeCorrelationIds(): string[] {
    return [...this.activeRuns.keys()];
  }
  get runCount(): number {
    return this.activeRuns.size;
  }
}
