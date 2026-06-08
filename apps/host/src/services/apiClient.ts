import { frameEventId } from "@edn/contracts/frames";
import type { Frame, FrameType, StoredEventDTO } from "../types";

/**
 * apiClient — the host's lowest service layer: raw HTTP to the adapter (ACA),
 * authenticated with the host's Clerk session token. No MobX awareness.
 *   - JSON reads carry `Authorization: Bearer <token>`.
 *   - the SSE stream carries `?access_token=<token>` (EventSource can't set
 *     headers; the adapter/broker accept the query param, see http-kit bearer()).
 */

const BASE = (import.meta.env.VITE_ADAPTER_URL as string | undefined) ?? "http://localhost:8080";
const API = `${BASE}/api/v1`;

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function eventsOrThrow(res: Response): Promise<StoredEventDTO[]> {
  if (!res.ok) throw new Error(`query failed (${res.status})`);
  const body = (await res.json().catch(() => ({}))) as { events?: StoredEventDTO[] };
  return body.events ?? [];
}

/** Per-run durable timeline from Postgres (tenant-scoped) — rebuilds a run on resync (F8/Gap 3). */
export async function queryByCorrelation(
  correlationId: string,
  token: string | null,
  limit = 200,
): Promise<StoredEventDTO[]> {
  const qs = new URLSearchParams({ correlationId, limit: String(limit) });
  const res = await fetch(`${API}/query?${qs.toString()}`, { headers: authHeaders(token) });
  return eventsOrThrow(res);
}

/** Recent events, unscoped — the backend serves these cross-tenant for super_admin/VP (dashboard). */
export async function queryRecent(token: string | null, limit = 25): Promise<StoredEventDTO[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`${API}/query?${qs.toString()}`, { headers: authHeaders(token) });
  return eventsOrThrow(res);
}

/** SSE URL for a run, with the session token as `?access_token` when present. */
export function streamUrl(correlationId: string, token: string | null): string {
  const url = new URL(`${API}/events/${correlationId}/stream`);
  if (token) url.searchParams.set("access_token", token);
  return url.toString();
}

/** Durable event types Postgres persists (the subset `/query` returns). */
const PERSISTED_TYPES = new Set<FrameType>(["vendor.requested", "vendor.responded", "vendor.failed"]);

/**
 * Map a durable `/query` row to a Frame for the ring buffer. `eventId` is the
 * decoupling seam: reuse the row's id, or rebuild the canonical one with the
 * contract's `frameEventId` so dedup against live frames is idempotent.
 */
export function rowToFrame(correlationId: string, row: StoredEventDTO): Frame | null {
  const type = row.eventType as FrameType;
  if (!PERSISTED_TYPES.has(type)) return null;
  return {
    v: 1,
    correlationId,
    seq: null,
    eventId: row.eventId ?? frameEventId(correlationId, type, row.ordinal ?? 0),
    ts: row.receivedAt,
    type,
    data: (row.payload ?? {}) as Record<string, unknown>,
  };
}
