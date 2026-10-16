import { describe, expect, it } from "vitest";
import { correspondenceRoleCapabilities } from "./correspondenceRole";

describe("correspondenceRoleCapabilities", () => {
  it("يمكّن التوجيه عند امتلاك manage_correspondence", () => {
    const caps = correspondenceRoleCapabilities("employee", ["manage_correspondence"]);
    expect(caps.canRoute).toBe(true);
    expect(caps.canChooseRouting).toBe(true);
  });

  it("يمنع التوجيه عند عدم امتلاك القدرة", () => {
    const caps = correspondenceRoleCapabilities("employee", []);
    expect(caps.canRoute).toBe(false);
    expect(caps.canChooseRouting).toBe(false);
  });

  it("يمنع التوجيه عند قدرة أخرى غير manage_correspondence", () => {
    const caps = correspondenceRoleCapabilities("employee", ["support"]);
    expect(caps.canRoute).toBe(false);
    expect(caps.canChooseRouting).toBe(false);
  });

  it("يمكّن التوجيه لصاحب full_control", () => {
    const caps = correspondenceRoleCapabilities("full_control", []);
    expect(caps.canRoute).toBe(true);
    expect(caps.canChooseRouting).toBe(true);
  });
});
