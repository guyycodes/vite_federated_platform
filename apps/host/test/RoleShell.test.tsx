import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";

/**
 * Acceptance #7 — the UI is dynamically driven by the state model: RoleShell
 * renders a different view per role and switches REACTIVELY when the model's
 * principal changes. We mock the Clerk bridge (so no ClerkProvider is needed)
 * and the federated remote (so the MF runtime isn't loaded) to isolate the gate.
 */
vi.mock("../src/hooks/useSharedContext-flow", () => ({
  useSharedContextFlow: () => ({ isReady: true, refreshRecent: async () => {} }),
}));
vi.mock("../src/components/RemoteSourcing", () => ({
  RemoteSourcing: () => <div>federated-sourcing-module</div>,
}));

import { sharedContextModel } from "../src/services/models/SharedContextModel";
import { SharedContextProvider } from "../src/contexts/SharedContextProvider";
import { RoleShell } from "../src/components/RoleShell";

function renderShell() {
  return render(
    <SharedContextProvider>
      <RoleShell />
    </SharedContextProvider>,
  );
}

beforeEach(() => {
  cleanup();
  sharedContextModel.reset();
});

describe("RoleShell — dynamic UI per role (state-model-driven)", () => {
  it("super_admin → Dashboard (no remote)", () => {
    act(() => sharedContextModel.setUser({ userId: "u", metadata: { accountType: "omni", role: "super_admin" } }));
    renderShell();
    expect(screen.getByText(/Platform dashboard/i)).toBeInTheDocument();
    expect(screen.queryByText("federated-sourcing-module")).not.toBeInTheDocument();
  });

  it("gba → federated module", () => {
    act(() => sharedContextModel.setUser({ userId: "u", metadata: { accountType: "gba", country: "US" } }));
    renderShell();
    expect(screen.getByText("federated-sourcing-module")).toBeInTheDocument();
  });

  it("omni/user → federated module", () => {
    act(() => sharedContextModel.setUser({ userId: "u", metadata: { accountType: "omni", role: "user" } }));
    renderShell();
    expect(screen.getByText("federated-sourcing-module")).toBeInTheDocument();
  });

  it("no recognized role → NoAccess", () => {
    act(() => sharedContextModel.setUser({ userId: "u", metadata: null }));
    renderShell();
    expect(screen.getByText(/No access yet/i)).toBeInTheDocument();
  });

  it("switches reactively when the model's principal changes", () => {
    act(() => sharedContextModel.setUser({ userId: "u", metadata: { accountType: "gba", country: "US" } }));
    renderShell();
    expect(screen.getByText("federated-sourcing-module")).toBeInTheDocument();

    act(() => sharedContextModel.setUser({ userId: "u", metadata: { accountType: "omni", role: "VP" } }));
    expect(screen.getByText(/Platform dashboard/i)).toBeInTheDocument();
    expect(screen.queryByText("federated-sourcing-module")).not.toBeInTheDocument();
  });
});
