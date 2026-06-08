import { Component, type ReactNode } from "react";

/**
 * Error boundary around a federated remote. A remote being unavailable (not
 * deployed, dev server down, network blip) must NOT crash the platform shell —
 * it renders the fallback instead. React error boundaries must be class
 * components, so this is the one class in the app.
 */
export class RemoteErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(): void {
    // Swallow — the fallback explains it; nothing actionable to log in dev.
  }

  override render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
