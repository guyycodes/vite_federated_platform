import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Test config is intentionally WITHOUT the federation plugin — unit/ui tests
 * exercise the shared-context model, services, and role-gated UI; the federated
 * remote is mocked (see test/RoleShell.test.tsx). jsdom + Testing Library.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: "ui",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
