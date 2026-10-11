import { describe, expect, it } from "vitest";
import { reportStart } from "./reporting";

describe("نطاق التقارير الدورية", () => {
  const now = new Date("2026-08-14T13:00:00Z");
  it("يبدأ التقرير اليومي من بداية اليوم السعودي (00:00 الرياض)", () => {
    expect(reportStart("daily", now).toISOString()).toBe("2026-08-13T21:00:00.000Z");
  });
  it("يبدأ التقرير الأسبوعي من يوم الاثنين السعودي", () => {
    expect(reportStart("weekly", now).toISOString()).toBe("2026-08-09T21:00:00.000Z");
  });
  it("يبدأ التقرير الشهري من أول الشهر السعودي والتاريخي من البداية", () => {
    expect(reportStart("monthly", now).toISOString()).toBe("2026-07-31T21:00:00.000Z");
    expect(reportStart("historical", now).toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });
});
