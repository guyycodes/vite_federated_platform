# Shared context: how the platform reads the module's ring buffer

The platform keeps its own MobX state and feeds it from each federated remote using the
published Frame contract. `SharedContextModel` is a **registry of one `ModuleContextModel`
per module** (named after the module: `sourcing`, …) — `sharedContextModel.module("sourcing")`
get-or-creates it; `runs`/`runCount` aggregate across all modules for the chrome/dashboard.
Two feed paths into a module's model, both dedup by the stable `eventId`:

```
                         ┌──────────────────────────── HOST ────────────────────────────┐
 Clerk sign-in ─▶ useSharedContext-flow ─▶ setUser(readPublicMetadata)                    │
                                         └▶ sharedContextService.restoreOnLoad(getToken)   │
                                                                                           │
  (A) MIRROR (live, in-session)            (B) RESTORE + OWN SSE (reload / dashboard)      │
  remote sourcingModel.runs (MobX) ─autorun▶ GET /query?correlationId  ──▶ rowToFrame ──┐    │
        │ (shared singleton)                 (authed Bearer)                           │    │
        └────────────────────────────────────────────────────────────────────────────┴──▶ sharedContextModel.module("sourcing").appendFrame (dedup by eventId)
                                            EventSource ?access_token (live tail) ─────┘
```

## (A) Mirror — the platform reads the federated module's ring buffer

Because `mobx` is a shared singleton, the remote's exposed `sourcingModel` is observable in
the host. `sharedContextService.mirrorRemoteModel("sourcing", sourcingModel)` runs an
`autorun` (one per module) that snapshots the remote's `runs[*].frames` and copies them into
that module's model — `sharedContextModel.module("sourcing")` — with host writes wrapped in
`untracked` so there's no read-write feedback loop. No second SSE for in-session runs.

## (B) Restore + own SSE — survives reload

On sign-in, `restoreOnLoad` reads the persisted runs from `localStorage` — shape
`{ [moduleName]: correlationId[] }` so each run restores into the right module — rebuilds
each run's timeline from the durable `/query` (authenticated, tenant-scoped), then opens the
host's own authenticated SSE (`EventSource` + `?access_token`) to tail. This is the remote's
F8/Gap-3 hydrate-then-tail resync, host-side: dedup-by-eventId makes the overlap idempotent.

`persist()` writes `{ module: cid[] }` (per-user-scoped key) on change; `reset` on sign-out.

## Adding another module

Each module gets its own named model automatically: call
`mirrorRemoteModel("<name>", <name>Model)` from the module's `Remote<Name>` component (and
add a `remotes.json` entry + a `declare module "<name>/*"` block). Its runs land in
`sharedContextModel.module("<name>")`, aggregate into `runs`/`runCount`, and persist/restore
under `"<name>"` — no model or service changes.

## Dynamic UI per role

`SharedContextModel.capabilities` (derived from `capabilitiesFor(metadata)`) drives the
`RoleShell` observer:

| principal | capability | view |
|---|---|---|
| omni / super_admin | dashboard, crossTenantRead | `<Dashboard/>` (reads unscoped `/query`) |
| omni / VP | dashboard, crossTenantRead | `<Dashboard/>` |
| omni / user | modules | `<RemoteSourcing/>` (federated) |
| gba | modules | `<RemoteSourcing/>` (federated) |
| (unrecognized) | — | `<NoAccess/>` |

The view re-renders reactively the moment the role resolves — no imperative routing on raw
Clerk metadata.

## Clerk setup (the claims the backend reads)

The backend (`@edn/http-kit` `auth.ts` → `claimsFromPayload`) reads `account_type`, `role`,
`country` (plus `org_id`/`org_slug`/`org_role`) from the **session token** that the host's
`apiClient` sends as `getToken()` (the default session JWT). Surface them via
**Dashboard → Sessions → Customize session token** — as FLAT top-level claims (our backend
reads them at the top level, not nested under `metadata`):

> ⚠ NOT "JWT Templates" — that panel issues tokens for external services and only applies
> if you call `getToken({ template })`. We use the default session token, so the claims must
> live in **Customize session token**.

```json
{
  "account_type": "{{user.public_metadata.accountType}}",
  "role": "{{user.public_metadata.role}}",
  "country": "{{user.public_metadata.country}}",
  "org_id": "{{org.id}}",
  "org_slug": "{{org.slug}}",
  "org_role": "{{org.role}}"
}
```

Seed users via **Users → (user) → Metadata → Public**:

```jsonc
{ "accountType": "omni", "role": "super_admin" }   // platform-wide reads
{ "accountType": "omni", "role": "VP" }            // read-only elevated across tenants
{ "accountType": "omni", "role": "user" }          // own org
{ "accountType": "gba",  "country": "US" }          // scoped to country US (read+write)
```

The backend matrix (authoritative): super_admin/VP read unscoped; omni-user/gba read+write
their own scope; cross-tenant read → 404. Writes are always own-scope (VP/super_admin can't
write cross-tenant).
