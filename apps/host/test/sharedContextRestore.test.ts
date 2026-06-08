import { describe, it, expect, beforeEach, vi } from "vitest";
import { sharedContextModel } from "../src/services/models/SharedContextModel";
import { sharedContextService } from "../src/services/sharedContextService";

/**
 * Acceptance #5 — on reload the shared context restores active runs PER MODULE:
 * persist() writes { module: cid[] }, and restoreOnLoad() rebuilds each run's
 * timeline from the authenticated /query into its named module model, then tails.
 */
const CID = "abcd1234-0000-0000-0000-000000000001";
const USER = "u-test";
const MOD = "sourcing";
const STORAGE_KEY = `platform.sharedContext.runs.${USER}`; // per-user scoped, per-module shape

class FakeEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(): void {}
  close(): void {}
}

beforeEach(() => {
  sharedContextModel.reset();
  localStorage.clear();
  sharedContextService.setUserScope(USER);
  // Harmless EventSource so subscribe()'s live tail doesn't open a real socket.
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});

describe("shared context persist + restore (per module)", () => {
  it("persist() writes { module: cid[] }; loadPersisted() reads it back", () => {
    sharedContextModel.module(MOD).upsertRun(CID);
    sharedContextService.persist();
    expect(sharedContextService.loadPersisted()).toEqual({ [MOD]: [CID] });
    expect(localStorage.getItem(STORAGE_KEY)).toContain(CID);
  });

  it("restoreOnLoad rebuilds a run into its module from /query (deduped), authenticated", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [MOD]: [CID] }));

    const rows = [
      {
        id: 1,
        eventType: "vendor.requested",
        payload: {},
        correlationId: CID,
        eventId: `${CID}:vendor.requested:0`,
        receivedAt: new Date().toISOString(),
      },
      {
        id: 2,
        eventType: "vendor.responded",
        payload: { verified: true },
        correlationId: CID,
        eventId: `${CID}:vendor.responded:0`,
        receivedAt: new Date().toISOString(),
      },
    ];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ count: rows.length, events: rows }),
    }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

    await sharedContextService.restoreOnLoad(async () => "tok-123");

    const run = sharedContextModel.module(MOD).activeRuns.get(CID);
    expect(run?.frames.map((f) => f.eventId)).toEqual([
      `${CID}:vendor.requested:0`,
      `${CID}:vendor.responded:0`,
    ]);
    expect(run?.module).toBe(MOD);
    expect(sharedContextModel.restored).toBe(true);

    // /query was called with the Bearer token.
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });
});
