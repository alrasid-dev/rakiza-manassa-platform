import { describe, expect, it } from "vitest";
import { computeCapabilities } from "./capabilities";

describe("computeCapabilities", () => {
  it("يعيد كل القدرات لحامل full_control (حتى عبر access_grants وليس admin)", () => {
    const caps = computeCapabilities("full_control", [], []);
    expect(caps).toContain("manage_tasks");
    expect(caps).toContain("manage_attendance");
    expect(caps).toContain("support");
    expect(caps).toContain("initiate_asset_request");
    expect(caps.length).toBeGreaterThanOrEqual(17);
  });

  it("يعيد قدرات الدور", () => {
    const caps = computeCapabilities(null, ["court_secretary"], []);
    expect(caps).toContain("manage_attendance");
    expect(caps).toContain("receive_asset_notifications");
    expect(caps).not.toContain("manage_trainees");
  });

  it("يعيد القدرة العامة (universal) لكل المستخدمين", () => {
    const caps = computeCapabilities(null, [], []);
    expect(caps).toContain("initiate_asset_request");
  });

  it("يعيد قدرات التفويض (specific)", () => {
    const caps = computeCapabilities(null, [], [
      { sourceRole: null, capabilities: { mode: "specific", capabilities: ["support"] }, unitId: null, targetUserId: null },
    ]);
    expect(caps).toContain("support");
  });
});
