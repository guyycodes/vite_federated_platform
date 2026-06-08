export function LoadingShell({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="panel centered">
      <p className="muted">{label}</p>
    </div>
  );
}
