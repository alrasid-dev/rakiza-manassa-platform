import { describe, expect, it } from "vitest";
import { accumulateWorkMinutes, taskLifecycleStage, taskWorkCountdownLabel } from "./work-hours";

// الأحد 2026-08-16؛ 10:00 الرياض = 07:00 UTC.
const scheduledFor = new Date("2026-08-16T07:00:00Z");

describe("work-hours (نسخة العميل) — accumulateWorkMinutes", () => {
  it("يستثني الجمعة/السبت والأعياد الرسمية", () => {
    expect(accumulateWorkMinutes(new Date("2026-08-16T04:00:00Z"), new Date("2026-08-16T11:30:00Z"))).toBe(450);
    expect(accumulateWorkMinutes(new Date("2026-08-14T04:00:00Z"), new Date("2026-08-14T11:30:00Z"))).toBe(0);
  });

  it("يحسب التراكم عبر الأيام", () => {
    expect(accumulateWorkMinutes(scheduledFor, new Date("2026-08-17T07:00:00Z"))).toBe(450);
    expect(accumulateWorkMinutes(scheduledFor, new Date("2026-08-18T07:00:00Z"))).toBe(900);
  });
});

describe("taskWorkCountdownLabel — نصوص المراحل", () => {
  it("يعرض «يبدأ بعد» قبل الفتح", () => {
    const before = new Date(scheduledFor.getTime() - 8 * 60 * 60 * 1000);
    expect(taskWorkCountdownLabel({ scheduledFor, status: "new", now: before })?.text).toContain("يبدأ بعد");
  });

  it("يعرض التنبيه بعد 7.5 ساعة عمل", () => {
    const now = new Date("2026-08-17T07:00:00Z");
    expect(taskLifecycleStage({ scheduledFor, now, status: "in_progress" })).toBe("notified");
    expect(taskWorkCountdownLabel({ scheduledFor, status: "in_progress", now })?.text).toContain("تنبيه");
  });

  it("يعرض المهلة الإضافية/المساءلة بعد 15 ساعة عمل", () => {
    const now = new Date("2026-08-18T11:45:00Z");
    expect(taskWorkCountdownLabel({ scheduledFor, status: "in_progress", now })?.text).toContain("مهلة إضافية");
  });

  it("يعرض «متبقي» أثناء المهلة الأساسية", () => {
    const now = new Date("2026-08-16T09:00:00Z"); // الأحد 12:00 الرياض
    const label = taskWorkCountdownLabel({ scheduledFor, status: "in_progress", now });
    expect(label?.text).toContain("متبقي");
  });
});
