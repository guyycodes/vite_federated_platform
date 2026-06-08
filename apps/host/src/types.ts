/**
 * Host-side view of the integration contracts. The Frame envelope is the
 * single-sourced seam between the host and the SOURCING remote — re-exported
 * type-only from the node-free `@edn/contracts/frames` entrypoint so no zod
 * runtime is pulled in for the types (the one runtime helper we DO use,
 * `frameEventId`, is imported explicitly where needed). `StoredEventDTO` matches
 * the adapter's `/query` JSON.
 */
export type { Frame, FrameType } from "@edn/contracts/frames";

export interface StoredEventDTO {
  id: number;
  eventType: string;
  payload: unknown;
  correlationId: string;
  /** Deterministic id for resync reconciliation against live frames (F8). */
  eventId?: string;
  ordinal?: number;
  receivedAt: string;
}
