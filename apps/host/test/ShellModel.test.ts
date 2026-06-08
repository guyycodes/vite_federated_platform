import { describe, it, expect, beforeEach } from "vitest";
import { shellModel } from "../src/services/models/ShellModel";

/** The wrapper↔working-area channel: the working area sets page chrome, the
 *  dashboard wrapper observes it. */
describe("ShellModel", () => {
  beforeEach(() => shellModel.reset());

  it("setPage updates title + subtitle", () => {
    shellModel.setPage("Sourcing", "sourcing module");
    expect(shellModel.title).toBe("Sourcing");
    expect(shellModel.subtitle).toBe("sourcing module");
  });

  it("setPage defaults subtitle to null", () => {
    shellModel.setPage("Dashboard");
    expect(shellModel.subtitle).toBeNull();
  });

  it("reset restores defaults", () => {
    shellModel.setPage("X", "y");
    shellModel.reset();
    expect(shellModel.title).toBe("Platform");
    expect(shellModel.subtitle).toBeNull();
  });
});
