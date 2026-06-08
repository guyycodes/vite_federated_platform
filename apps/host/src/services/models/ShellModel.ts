import { makeAutoObservable, runInAction } from "mobx";

/**
 * ShellModel — the wrapper↔working-area channel (MobX singleton). The working
 * area (a dashboard page, or a federated module via an injected port) pushes
 * page CHROME up: title, subtitle. The dashboard wrapper (AppHeader/AppSidebar)
 * observes it and re-renders reactively.
 *
 * SOLID seam: pages depend on this small abstraction (setPage), NOT on the
 * header; the header depends on this model, NOT on any page. Add a module and it
 * drives the chrome by calling setPage — no wrapper edits. (Domain run state is
 * separate, in SharedContextModel, which the wrapper also observes for live
 * badges like "N active".)
 */
class ShellModel {
  title = "Platform";
  subtitle: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setPage(title: string, subtitle: string | null = null): void {
    runInAction(() => {
      this.title = title;
      this.subtitle = subtitle;
    });
  }

  reset(): void {
    runInAction(() => {
      this.title = "Platform";
      this.subtitle = null;
    });
  }
}

/** Shared singleton — the working area writes it, the wrapper reads it. */
export const shellModel = new ShellModel();
export type { ShellModel };
