import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";

/**
 * Platform shell = a Vite Module Federation HOST.
 *
 * - `remotes.sourcing` is the STATIC happy-path binding (dev DX + lets MF resolve
 *   `sourcing/*` imports). The PRIMARY production path is DYNAMIC: at runtime the
 *   host fetches a manifest and calls registerRemotes()/loadRemote() (see
 *   src/services/remoteRegistryService.ts) so the remote can live anywhere.
 * - `shared` singletons mean ONE React / MobX in the page, so the remote's
 *   exposed MobX `sourcingModel` is reactive across the federation boundary and
 *   the host can read its ring buffer. Clerk is NOT shared: the remote is
 *   Clerk-agnostic and receives a `getToken` prop from the host instead.
 */
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "host",
      // Dynamic-first: remotes are registered at RUNTIME from the manifest
      // (remoteRegistryService → registerRemotes/loadRemote), so the host build
      // doesn't pin where the remote lives. Declaring a static remote here too
      // would double-register "sourcing" (the "already registered" warning) and make
      // the DTS plugin try to fetch @mf-types.zip from a maybe-down remote. Types
      // come from src/remotes.d.ts instead.
      remotes: {},
      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false },
        mobx: { singleton: true, requiredVersion: false },
        "mobx-react-lite": { singleton: true, requiredVersion: false },
      },
    }),
  ],
  server: {
    host: true,
    port: 5174,
  },
  build: {
    target: "esnext", // Module Federation needs top-level await
  },
});
