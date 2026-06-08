import { shellModel, type ShellModel } from "../services/models/ShellModel";

/**
 * useShell — handle on the wrapper↔working-area channel. Working-area views call
 * `useShell().setPage(title, subtitle)` (typically in an effect on mount); the
 * wrapper reads `title`/`subtitle` as an observer. It's a MobX singleton, so no
 * provider is needed — observer components re-render on change.
 */
export function useShell(): ShellModel {
  return shellModel;
}
