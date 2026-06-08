# How the federation works (and why it feels seamless)

## One page, one React, one Clerk

The host declares `shared` singletons in `vite.config.ts`:

```ts
shared: { react, "react-dom", mobx, "mobx-react-lite" }  // all singleton: true
```

`singleton: true` means the Module Federation runtime loads exactly ONE copy of
each in the page and hands it to both host and remote. That's why:

- The remote's components run on the host's React (hooks/Context work across the boundary).
- The remote's exposed MobX `sourcingModel` is observable **in the host** — the host can
  read its ring buffer reactively into a per-module state model
  (`sharedContextService.mirrorRemoteModel("sourcing", sourcingModel)`).

Clerk is deliberately **not** shared. The remote is Clerk-agnostic: the host passes a
`getToken` prop (from its own `<ClerkProvider>`) into the exposed `SourcingModule`, which
wires it into the remote's `hostBridge`. The remote authenticates every call with the
host's identity without ever importing Clerk — so there's no second login and no risk of
two Clerk instances fighting.

## Dynamic remotes (we run dynamic-only)

`vite.config.ts` sets `remotes: {}` — we do NOT declare a static remote. At runtime
`remoteRegistryService` fetches a manifest (`/remotes.json` or `VITE_REMOTES_MANIFEST_URL`)
and calls `registerRemotes([{ name, entry }])`, then `loadRemote("sourcing/SourcingModule")`.
The host build does NOT hardcode where the remote lives — it learns at runtime, so the
remote can be deployed/moved/cloud-hosted independently.

Why no static remote: declaring one too would (a) double-register the name (the
"already registered" runtime warning) and (b) make the DTS plugin try to fetch
`@mf-types.zip` from a maybe-down remote. TypeScript types for `sourcing/*` come from
`src/remotes.d.ts` instead.

This is the modern rebuild of `buster_and_co`'s webpack-era dynamic plugin loader
(server-served manifest of remote URLs + runtime injection), but on the Vite MF runtime:
no `<script>` injection, no manual `window[container].init(shareScope)` — the runtime
owns the shared scope. Adding a module = a `remotes.json` entry + a `declare module` block,
no host rebuild.

## The contract seam (deploy independently)

Host and remote agree only on the **Frame contract** (`@edn/contracts/frames`,
`ENVELOPE_VERSION = 1`) and dedup by the stable `eventId`. Either side can redeploy as
long as the contract version stays compatible.

- **Dev:** the host depends on `@edn/contracts` via a `file:` link to the sibling repo.
- **Prod (do this for cloud):** publish `@edn/contracts` to your registry (npm / GitHub
  Packages) and replace the `file:` link with a version range, e.g.
  `"@edn/contracts": "^0.1"`. Same import path, now a versioned artifact — the standard
  way two independently-deployed apps share a contract. If you must change the contract,
  bump `ENVELOPE_VERSION` and keep it backward-compatible.

## CORS

The browser origin is the host (`:5174`). It fetches:
- `remoteEntry.js` + chunks from the remote origin (`:5173`) — Vite dev serves these with
  permissive CORS (`server.cors: true`). In prod, serve the remoteEntry with
  `Access-Control-Allow-Origin` for the host origin (or same-origin via a gateway).
- JSON + SSE from the adapter (`:8080`) — set `CORS_ORIGINS` on the adapter + broker to
  include `http://localhost:5174`.

## Known trade-off

For runs the remote starts in-session, the host reads them via the MobX **mirror** (no 2nd
SSE). For runs restored on reload (the remote doesn't know them), the host opens its own
authenticated SSE. A future optimization is a host-provided `onFrame(cid, frame)` callback
so the remote pushes into the shared context and the host never opens a second connection.
