import { loadRemote, registerRemotes } from "@module-federation/enhanced/runtime";
import type { ComponentType } from "react";

/**
 * remoteRegistryService — the production analog of buster_and_co's webpack-era
 * dynamic plugin loader (pluginRegistry.js + pluginLoader.js), rebuilt on the
 * Vite Module Federation RUNTIME.
 *
 * Old (webpack): fetch a manifest of remote URLs → inject a <script> for
 * remoteEntry.js → read window[container] → container.get(expose).
 * New (Vite MF): fetch a manifest → `registerRemotes([{ name, entry }])` →
 * `loadRemote("name/Expose")`. No global script injection, no manual share-scope
 * wiring — the MF runtime owns shared singletons (react/mobx) for us.
 *
 * The host's vite.config also declares a STATIC `sourcing` remote, so loadRemote
 * works even if the manifest fetch fails (graceful fallback). The manifest is
 * the dynamic seam: remotes can be added/moved/cloud-hosted without rebuilding
 * the host.
 */

export interface RemoteManifestEntry {
  name: string;
  entry: string;
  exposedModule?: string;
}

const MANIFEST_URL = (import.meta.env.VITE_REMOTES_MANIFEST_URL as string | undefined) ?? "/remotes.json";

class RemoteRegistryService {
  private registered = false;
  private registering: Promise<void> | null = null;

  /** Fetch the registry manifest (best-effort; static vite.config is the fallback). */
  async fetchManifest(): Promise<RemoteManifestEntry[]> {
    try {
      const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      const body = (await res.json()) as { remotes?: RemoteManifestEntry[] };
      return Array.isArray(body.remotes) ? body.remotes : [];
    } catch {
      return [];
    }
  }

  /** Idempotently register every manifest remote with the MF runtime. */
  async ensureRegistered(): Promise<void> {
    if (this.registered) return;
    if (this.registering) return this.registering;
    this.registering = (async () => {
      const remotes = await this.fetchManifest();
      if (remotes.length > 0) {
        // force: override the static vite.config binding of the same name cleanly
        // (the manifest is the authoritative runtime source of where remotes live).
        registerRemotes(
          remotes.map((r) => ({ name: r.name, entry: r.entry })),
          { force: true },
        );
      }
      this.registered = true;
    })();
    return this.registering;
  }

  /**
   * Load an exposed module from a (possibly dynamically-registered) remote.
   * `exposed` is the key as declared in the remote's `exposes` ("./SourcingModule").
   */
  async load<T = { default: ComponentType<Record<string, unknown>> }>(
    name: string,
    exposed: string,
  ): Promise<T> {
    await this.ensureRegistered();
    const id = `${name}/${exposed.replace(/^\.\//, "")}`;
    const mod = await loadRemote<T>(id);
    if (!mod) throw new Error(`remote "${id}" failed to load`);
    return mod;
  }
}

export const remoteRegistryService = new RemoteRegistryService();
