/**
 * Full-screen rehydration loader (mirrors Widget-SaaS's TenantClient gate). Held
 * until auth + the shared context have hydrated, so the shell renders all at once
 * instead of popping in (blank → empty header → role badge → view). Reused for
 * every future surface by gating at the App root.
 */
export function FullScreenLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="fullscreen-loader" role="status" aria-live="polite">
      <div className="spinner" aria-hidden />
      <p className="muted">{label}</p>
    </div>
  );
}
