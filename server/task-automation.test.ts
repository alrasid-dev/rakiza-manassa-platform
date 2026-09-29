import { describe, expect, it } from "vitest";
import { escalationAt, escalationStage, isSaudiWorkday, isTemplateDue, isWithinSaudiWorkHours, nextSaudiWorkStart, saudiScheduledTime, shouldEscalateTask, taskEscalationDeadline } from "./task-automation";

describe("أتمتة مهام شؤون الملازمين", () => {
  const sunday = new Date("2026-08-16T05:00:00Z");
  const friday = new Date("2026-08-14T05:00:00Z");
  it("تنشئ المهام اليومية في أيام العمل السعودية فقط", () => {
    expect(isSaudiWorkday(sunday)).toBe(true);
    expect(isSaudiWorkday(friday)).toBe(false);
    expect(isTemplateDue("daily", true, sunday)).toBe(true);
    expect(isTemplateDue("daily", true, friday)).toBe(false);
  });
  it("يكون الموعد الأسبوعي يوم الأحد والمهلة ست ساعات", () => {
    expect(isTemplateDue("weekly", true, sunday)).toBe(true);
    expect(escalationAt(saudiScheduledTime(sunday, 7)).getTime() - saudiScheduledTime(sunday, 7).getTime()).toBe(6 * 60 * 60 * 1000);
  });
  it("ينشئ القوالب الشهرية والربع سنوية في أول يوم من الفترة فقط", () => {
    const firstOfMonth = new Date("2026-09-01T05:00:00Z");
    const firstOfQuarter = new Date("2026-10-01T05:00:00Z");
    const midMonth = new Date("2026-09-02T05:00:00Z");
    expect(isTemplateDue("monthly", false, firstOfMonth)).toBe(true);
    expect(isTemplateDue("quarterly", false, firstOfQuarter)).toBe(true);
    expect(isTemplateDue("monthly", false, midMonth)).toBe(false);
    expect(isTemplateDue("quarterly", false, firstOfMonth)).toBe(false);
  });
  it("يعامل التكرار المخصص كتكرار يومي", () => {
    expect(isTemplateDue("custom", true, sunday)).toBe(true);
    expect(isTemplateDue("custom", true, friday)).toBe(false);
  });
  it("يقصر التنفيذ الفوري الوارد من المصدر المرتبط على نافذة السابعة إلى الثالثة", () => {
    expect(isWithinSaudiWorkHours(new Date("2026-08-16T04:00:00Z"))).toBe(true);
    expect(isWithinSaudiWorkHours(new Date("2026-08-16T12:00:00Z"))).toBe(false);
  });
  it("يستخدم الاستحقاق المبكر بدلاً من انتظار ست ساعات عند وجود موعد أقرب", () => {
    const scheduled = new Date("2026-08-16T04:00:00Z");
    const earlyDue = new Date("2026-08-16T06:00:00Z");
    expect(taskEscalationDeadline(scheduled, earlyDue)).toEqual(earlyDue);
    expect(shouldEscalateTask(scheduled, earlyDue, new Date("2026-08-16T06:00:00Z"))).toBe(true);
  });
  it("يرحّل التحديث الوارد خارج ساعات العمل إلى السابعة من يوم العمل التالي", () => {
    expect(nextSaudiWorkStart(new Date("2026-08-14T17:00:00Z")).toISOString()).toBe("2026-08-16T04:00:00.000Z");
  });
  it("ينقل المهمة من التعثر الأول إلى الإحالة الإشرافية بعد ست ساعات إضافية", () => {
    const scheduled = new Date("2026-08-16T04:00:00Z");
    const due = new Date("2026-08-16T14:00:00Z");
    expect(escalationStage(scheduled, due, new Date("2026-08-16T10:00:00Z"))).toBe("first");
    expect(escalationStage(scheduled, due, new Date("2026-08-16T16:00:00Z"))).toBe("supervisory");
  });
});
