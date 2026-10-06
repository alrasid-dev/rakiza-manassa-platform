import { describe, expect, it } from "vitest";
import { accumulateWorkMinutes, DEADLINE_WORK_MINUTES, NOTIFY_WORK_MINUTES, taskLifecycleStage } from "./task-automation";

// الأحد 2026-08-16 (يوم عمل سعودي)؛ 10:00 بتوقيت الرياض = 07:00 UTC.
const scheduledFor = new Date("2026-08-16T07:00:00Z");

describe("accumulateWorkMinutes — المرجع الموحّد لساعات العمل", () => {
  it("يستثني الجمعة والسبت والأعياد الرسمية", () => {
    const sunday = new Date("2026-08-16T04:00:00Z");
    const friday = new Date("2026-08-14T04:00:00Z");
    const nationalDay = new Date("2026-09-23T04:00:00Z"); // اليوم الوطني
    expect(accumulateWorkMinutes(sunday, new Date("2026-08-16T11:30:00Z"))).toBe(450);
    expect(accumulateWorkMinutes(friday, new Date("2026-08-14T11:30:00Z"))).toBe(0);
    expect(accumulateWorkMinutes(nationalDay, new Date("2026-09-23T11:30:00Z"))).toBe(0);
  });

  it("يحسب التراكم عبر الأيام (مهمة 10:00)", () => {
    // الأحد 10:00 → الاثنين 10:00 = 4.5 + 3 = 7.5 ساعة = 450 دقيقة.
    expect(accumulateWorkMinutes(scheduledFor, new Date("2026-08-17T07:00:00Z"))).toBe(450);
    // الأحد 10:00 → الثلاثاء 10:00 = 4.5 + 7.5 + 3 = 15 ساعة = 900 دقيقة.
    expect(accumulateWorkMinutes(scheduledFor, new Date("2026-08-18T07:00:00Z"))).toBe(900);
  });

  it("يعيد 0 عندما يكون البدء بعد النهاية", () => {
    expect(accumulateWorkMinutes(new Date("2026-08-17T07:00:00Z"), scheduledFor)).toBe(0);
  });
});

describe("taskLifecycleStage — مراحل دورة حياة المهمة", () => {
  it("تفتح المهمة قبل scheduledFor بأربع ساعات", () => {
    const fourHoursBefore = new Date(scheduledFor.getTime() - 4 * 60 * 60 * 1000);
    const fiveHoursBefore = new Date(scheduledFor.getTime() - 5 * 60 * 60 * 1000);
    expect(taskLifecycleStage({ scheduledFor, now: fiveHoursBefore, status: "new" })).toBe("future");
    expect(taskLifecycleStage({ scheduledFor, now: fourHoursBefore, status: "new" })).toBe("opening");
  });

  it("تصل مهمة 10:00 إلى 7.5 ساعة عمل يوم 2 عند الساعة 10:00 → تنبيه", () => {
    const stage = taskLifecycleStage({ scheduledFor, now: new Date("2026-08-17T07:00:00Z"), status: "in_progress" });
    expect(accumulateWorkMinutes(scheduledFor, new Date("2026-08-17T07:00:00Z"))).toBe(NOTIFY_WORK_MINUTES);
    expect(stage).toBe("notified");
  });

  it("تصل إلى المهلة الإضافية عند 900 دقيقة عمل", () => {
    const now = new Date("2026-08-18T07:00:00Z"); // الثلاثاء 10:00 الرياض
    expect(accumulateWorkMinutes(scheduledFor, now)).toBe(DEADLINE_WORK_MINUTES);
    expect(taskLifecycleStage({ scheduledFor, now, status: "in_progress" })).toBe("deadline");
  });

  it("تُنشأ المساءلة عند 14:45 بعد تجاوز 900 دقيقة عمل", () => {
    const now = new Date("2026-08-18T11:45:00Z"); // الثلاثاء 14:45 الرياض
    expect(taskLifecycleStage({ scheduledFor, now, status: "in_progress" })).toBe("disciplinary");
  });

  it("المهام المفتوحة (isOpen) مستثناة من الفحوص الزمنية", () => {
    const now = new Date("2026-08-18T11:45:00Z");
    expect(taskLifecycleStage({ scheduledFor, now, status: "in_progress", isOpen: true })).toBe("active");
  });

  it("المهام المنتهية/قيد المراجعة لا تخضع لضغط زمني", () => {
    const now = new Date("2026-08-18T11:45:00Z");
    expect(taskLifecycleStage({ scheduledFor, now, status: "completed" })).toBe("active");
    expect(taskLifecycleStage({ scheduledFor, now, status: "under_review" })).toBe("active");
  });
});
