# Platform Shell (host)

A **standalone** Vite Module Federation **host** that dynamically loads the SOURCING
remote (`api_event_driven_system/apps/web`), owns the Clerk session, and keeps a
role-driven **shared context** that reads the remote's ring buffer of Frames.

```
<ClerkProvider>            ← the ONLY ClerkProvider in the page
  <SharedContextProvider>  ← MobX SharedContextModel (platform reads)
    <App>
      SignedOut → sign-in
      SignedIn  → RoleShell (dynamic, state-model-driven):
          super_admin / VP → <Dashboard/>        (cross-tenant read, no remote)
          gba / omni-user  → <RemoteSourcing/>      (federated module via loadRemote)
          else             → <NoAccess/>
```

## Architecture (mirrors the remote)

```
Components → Contexts ↔ Hooks → Services → Models
```

- `lib/authMetadata.ts` — the RBAC union + `capabilitiesFor` (single source of UI policy).
- `services/models/ModuleContextModel.ts` — **one model per federated module** (named after it);
  dedups frames by `eventId`, bounded ring buffer.
- `services/models/SharedContextModel.ts` — registry of `ModuleContextModel`s
  (`module(name)`) + current user + aggregate `runs`/`runCount`.
- `services/models/ShellModel.ts` — the wrapper↔working-area channel (page title/subtitle).
- `services/apiClient.ts` — authed JSON + SSE URL (`?access_token`) + row→Frame mapping.
- `services/sharedContextService.ts` — restore-from-`/query` + live SSE tail + per-module
  persist + the autorun **mirror** of each module's exposed ring buffer.
- `services/remoteRegistryService.ts` — the dynamic registry (`registerRemotes`/`loadRemote`).
- `contexts/SharedContextProvider.tsx` + `hooks/useSharedContext-flow.ts` — Clerk → model bridge
  (race-safe: module-scoped per-user-once + concurrent-collapse guards).
- `contexts/SidebarContext.tsx` + `components/dashboard/*` (`DashboardLayout`/`AppHeader`/
  `AppSidebar`/`Backdrop`) — the dashboard shell (sidebar + top bar) wrapping the working area.
- `components/RoleShell.tsx` — the `observer` that renders the view from `capabilities`
  (`Dashboard` | `RemoteSourcing` | `NoAccess`); `FullScreenLoader` gates the app until
  hydration (no jumpy pop-in); `RemoteErrorBoundary`/`ModuleUnavailable` degrade a down remote.

See [docs/FEDERATION.md](docs/FEDERATION.md) and [docs/SHARED_CONTEXT.md](docs/SHARED_CONTEXT.md).

## Sign-in note (Clerk Client Trust)

The dev instance has Clerk **Client Trust** on, which gates **password** sign-ins on a new
device with a step current clerk-js can't render (`needs_client_trust not supported yet`).
Sign in with **Google** or switch the instance to **email-code** (Configure → User &
authentication) — OAuth/email-code aren't gated. Not a code issue.

## Run locally

```bash
# 1. backend (in api_event_driven_system): infra + adapter/broker/vendor-sim
#    set CORS_ORIGINS to include http://localhost:5174 (the host origin)
# 2. remote (serves remoteEntry.js on :5173)
cd ../../../api_event_driven_system && npm run dev:web

# 3. host
cp .env.example .env.local   # set VITE_CLERK_PUBLISHABLE_KEY
npm install                  # from the repo root
npm run dev                  # http://localhost:5174
```

`npm run verify` (repo root) = typecheck + lint + tests.

## Env

| var | meaning |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (host owns the only ClerkProvider) |
| `VITE_ADAPTER_URL` | Adapter (ACA) base URL for JSON + SSE (default `http://localhost:8080`) |
| `VITE_REMOTES_MANIFEST_URL` | Registry manifest (default bundled `/remotes.json`) |
