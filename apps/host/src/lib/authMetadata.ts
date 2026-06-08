/**
 * RBAC metadata — the client mirror of the backend's auth.ts union. The HOST
 * stores this in Clerk publicMetadata and surfaces it into the session token
 * (JWT template) so the backend reads the same shape as claims. Ported from the
 * LeadGenAgent_V2 authMetadata pattern (validate-then-narrow), generalized to
 * this app's discriminated union.
 *
 *   omni { role: super_admin | VP | user }   — platform principals (tenant = org)
 *   gba  { country }                          — country-scoped principals (tenant = country)
 *
 * This is the SINGLE source of UI policy: `capabilitiesFor` decides what a
 * principal can see, and both the MobX model and the role-gated shell delegate
 * to it (no scattered role checks).
 */

export const OMNI_ROLES = ["super_admin", "VP", "user"] as const;
export type OmniRole = (typeof OMNI_ROLES)[number];

export interface OmniMetadata {
  accountType: "omni";
  role: OmniRole;
}
export interface GbaMetadata {
  accountType: "gba";
  country: string;
}
export type AppMetadata = OmniMetadata | GbaMetadata;

function isOmniRole(v: unknown): v is OmniRole {
  return typeof v === "string" && (OMNI_ROLES as readonly string[]).includes(v);
}

/**
 * Validate + narrow Clerk publicMetadata into the union. Corrupt/partial
 * metadata (dashboard typo, mid-migration) returns null rather than passing a
 * malformed object downstream — those principals land on NoAccess.
 */
export function readPublicMetadata(raw: unknown): AppMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const md = raw as Record<string, unknown>;
  if (md.accountType === "omni" && isOmniRole(md.role)) {
    return { accountType: "omni", role: md.role };
  }
  if (md.accountType === "gba" && typeof md.country === "string" && md.country.length > 0) {
    return { accountType: "gba", country: md.country };
  }
  return null;
}

export function isSuperAdmin(m: AppMetadata | null): boolean {
  return m?.accountType === "omni" && m.role === "super_admin";
}
export function isVP(m: AppMetadata | null): boolean {
  return m?.accountType === "omni" && m.role === "VP";
}
export function isGba(m: AppMetadata | null): boolean {
  return m?.accountType === "gba";
}

/** Tenant (row-scoping key): gba → country, omni → the Clerk org (passed in). */
export function tenantFor(m: AppMetadata | null, orgId?: string | null): string | null {
  if (m?.accountType === "gba") return m.country;
  return orgId ?? null;
}

export interface Capabilities {
  /** super_admin / VP → the cross-tenant Dashboard (the diagram's is_admin? = Yes). */
  dashboard: boolean;
  /** gba / omni-user → the federated modules (the diagram's GBAs branch). */
  modules: boolean;
  /** reads are served unscoped by the backend (platform-wide). */
  crossTenantRead: boolean;
}

/** The whole UI policy in one pure function — easy to unit-test and extend. */
export function capabilitiesFor(m: AppMetadata | null): Capabilities {
  const superAdmin = isSuperAdmin(m);
  const vp = isVP(m);
  const omniUser = m?.accountType === "omni" && m.role === "user";
  const gba = isGba(m);
  return {
    dashboard: superAdmin || vp,
    modules: gba || omniUser,
    crossTenantRead: superAdmin || vp,
  };
}
