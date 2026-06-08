import { describe, it, expect } from "vitest";
import {
  readPublicMetadata,
  capabilitiesFor,
  tenantFor,
  isSuperAdmin,
  isVP,
  isGba,
} from "../src/lib/authMetadata";

describe("readPublicMetadata", () => {
  it("narrows a valid omni principal", () => {
    expect(readPublicMetadata({ accountType: "omni", role: "super_admin" })).toEqual({
      accountType: "omni",
      role: "super_admin",
    });
  });
  it("narrows a valid gba principal", () => {
    expect(readPublicMetadata({ accountType: "gba", country: "US" })).toEqual({
      accountType: "gba",
      country: "US",
    });
  });
  it("rejects malformed / partial metadata", () => {
    expect(readPublicMetadata(null)).toBeNull();
    expect(readPublicMetadata({ accountType: "omni", role: "boss" })).toBeNull();
    expect(readPublicMetadata({ accountType: "gba" })).toBeNull();
    expect(readPublicMetadata({ accountType: "wat" })).toBeNull();
  });
});

describe("tenantFor", () => {
  it("gba → country; omni → org", () => {
    expect(tenantFor({ accountType: "gba", country: "US" }, "org_x")).toBe("US");
    expect(tenantFor({ accountType: "omni", role: "user" }, "org_x")).toBe("org_x");
    expect(tenantFor(null, "org_x")).toBe("org_x");
  });
});

describe("role predicates", () => {
  it("identifies super_admin / VP / gba", () => {
    expect(isSuperAdmin({ accountType: "omni", role: "super_admin" })).toBe(true);
    expect(isVP({ accountType: "omni", role: "VP" })).toBe(true);
    expect(isGba({ accountType: "gba", country: "US" })).toBe(true);
    expect(isSuperAdmin({ accountType: "omni", role: "VP" })).toBe(false);
  });
});

describe("capabilitiesFor — the single source of UI policy", () => {
  it("super_admin → dashboard + cross-tenant read, no module load", () => {
    expect(capabilitiesFor({ accountType: "omni", role: "super_admin" })).toEqual({
      dashboard: true,
      modules: false,
      crossTenantRead: true,
    });
  });
  it("VP → dashboard + cross-tenant read", () => {
    expect(capabilitiesFor({ accountType: "omni", role: "VP" })).toEqual({
      dashboard: true,
      modules: false,
      crossTenantRead: true,
    });
  });
  it("omni/user → federated modules only", () => {
    expect(capabilitiesFor({ accountType: "omni", role: "user" })).toEqual({
      dashboard: false,
      modules: true,
      crossTenantRead: false,
    });
  });
  it("gba → federated modules only", () => {
    expect(capabilitiesFor({ accountType: "gba", country: "US" })).toEqual({
      dashboard: false,
      modules: true,
      crossTenantRead: false,
    });
  });
  it("no metadata → no capabilities (NoAccess)", () => {
    expect(capabilitiesFor(null)).toEqual({
      dashboard: false,
      modules: false,
      crossTenantRead: false,
    });
  });
});
