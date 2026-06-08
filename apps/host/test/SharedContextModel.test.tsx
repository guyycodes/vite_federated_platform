import { describe, it, expect, beforeEach } from "vitest";
import { sharedContextModel } from "../src/services/models/SharedContextModel";
import type { Frame } from "../src/types";

/**
 * Acceptance #4 — each module's state model dedups timeline frames by the stable
 * eventId (not server seq), so a redelivered frame is idempotent and a resync
 * (hydrate-from-/query) then live tail reconciles with NO duplicates. Plus: the
 * shared context keeps ONE model PER module (the registry), aggregating runs.
 */
const CID = "55555555-5555-5555-5555-555555555555";
const MOD = "sourcing";

function frame(seq: number, eventId: string, type: Frame["type"] = "vendor.responded"): Frame {
  return { v: 1, correlationId: CID, seq, eventId, ts: "", type };
}

describe("ModuleContextModel.appendFrame dedup (F8)", () => {
  beforeEach(() => sharedContextModel.reset());

  it("auto-creates the run and dedups a redelivered frame by eventId despite a new seq", () => {
    const m = sharedContextModel.module(MOD);
    m.appendFrame(CID, frame(5, `${CID}:vendor.responded:0`));
    m.appendFrame(CID, frame(9, `${CID}:vendor.responded:0`)); // redelivery
    expect(m.activeRuns.get(CID)?.frames.length).toBe(1);
  });

  it("keeps frames with distinct eventIds", () => {
    const m = sharedContextModel.module(MOD);
    m.appendFrame(CID, frame(1, `${CID}:vendor.requested:0`, "vendor.requested"));
    m.appendFrame(CID, frame(2, `${CID}:vendor.responded:0`));
    expect(m.activeRuns.get(CID)?.frames.length).toBe(2);
  });

  it("resync (hydrate-from-query, seq:null) then live tail reconciles with no duplicates", () => {
    const m = sharedContextModel.module(MOD);
    m.appendFrame(CID, frame(1, `${CID}:vendor.requested:0`, "vendor.requested"));
    m.appendFrame(CID, {
      v: 1, correlationId: CID, seq: null, eventId: `${CID}:vendor.requested:0`, ts: "", type: "vendor.requested",
    }); // already-seen → deduped
    m.appendFrame(CID, {
      v: 1, correlationId: CID, seq: null, eventId: `${CID}:vendor.responded:0`, ts: "", type: "vendor.responded",
    }); // recovered missed frame
    m.appendFrame(CID, frame(7, `${CID}:vendor.responded:0`)); // live re-deliver → deduped

    const ids = m.activeRuns.get(CID)?.frames.map((f) => f.eventId);
    expect(ids).toEqual([`${CID}:vendor.requested:0`, `${CID}:vendor.responded:0`]);
  });

  it("derives terminal status from a run.completed frame", () => {
    const m = sharedContextModel.module(MOD);
    m.appendFrame(CID, frame(1, `${CID}:vendor.responded:0`));
    m.appendFrame(CID, {
      v: 1, correlationId: CID, seq: 2, eventId: `${CID}:run.completed:0`, ts: "", type: "run.completed",
    });
    expect(m.activeRuns.get(CID)?.status).toBe("completed");
  });

  it("evicts oldest beyond the ring buffer cap", () => {
    const m = sharedContextModel.module(MOD);
    for (let i = 0; i < 250; i++) {
      m.appendFrame(CID, frame(i, `${CID}:persist.written:${i}`, "persist.written"));
    }
    expect(m.activeRuns.get(CID)?.frames.length).toBe(200);
  });

  it("tags each run with its module name", () => {
    const m = sharedContextModel.module(MOD);
    m.appendFrame(CID, frame(1, `${CID}:vendor.responded:0`));
    expect(m.activeRuns.get(CID)?.module).toBe(MOD);
  });
});

describe("SharedContextModel — per-module registry", () => {
  beforeEach(() => sharedContextModel.reset());

  it("keeps one model per module and returns the same instance for a name", () => {
    const a = sharedContextModel.module("sourcing");
    const b = sharedContextModel.module("sourcing");
    const c = sharedContextModel.module("billing");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(sharedContextModel.moduleNames.sort()).toEqual(["billing", "sourcing"]);
  });

  it("aggregates runCount and flattens runs across modules", () => {
    sharedContextModel.module("sourcing").appendFrame("cid-1", frame(1, "cid-1:vendor.responded:0"));
    sharedContextModel.module("billing").appendFrame("cid-2", frame(1, "cid-2:vendor.responded:0"));
    expect(sharedContextModel.runCount).toBe(2);
    expect(sharedContextModel.runs.map((r) => r.module).sort()).toEqual(["billing", "sourcing"]);
  });
});
