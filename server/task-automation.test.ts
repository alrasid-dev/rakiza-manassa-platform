import { describe, expect, it } from "vitest";
import { isSaudiWorkday, isTemplateDue, isWithinSaudiWorkHours, nextSaudiWorkStart } from "./task-automation";

describe("أتمتة مهام شؤون الملازمين", () => {
  const sunday = new Date("2026-08-16T05:00:00Z");
  const friday = new Date("2026-08-14T05:00:00Z");
  it("تنشئ المهام اليومية في أيام العمل السعودية فقط", () => {
    expect(isSaudiWorkday(sunday)).toBe(true);
    expect(isSaudiWorkday(friday)).toBe(false);
    expect(isTemplateDue("daily", true, sunday)).toBe(true);
    expect(isTemplateDue("daily", true, friday)).toBe(false);
  });
  it("يكون الموعد الأسبوعي يوم الأحد", () => {
    expect(isTemplateDue("weekly", true, sunday)).toBe(true);
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
  it("يدعم السنوي (1 يناير) وكل X أيام (interval)", () => {
    const jan1 = new Date("2026-01-01T05:00:00Z");
    const feb1 = new Date("2026-02-01T05:00:00Z");
    expect(isTemplateDue("yearly", false, jan1)).toBe(true);
    expect(isTemplateDue("yearly", false, feb1)).toBe(false);
    // أول مرة بدون lastGeneratedAt → تُنشأ فوراً
    expect(isTemplateDue("custom", false, jan1, 3, null)).toBe(true);
    // بعد 3 أيام → تُنشأ نسخة جديدة
    expect(isTemplateDue("custom", false, new Date("2026-01-04T05:00:00Z"), 3, jan1)).toBe(true);
    // بعد يومين فقط → لا تُنشأ
    expect(isTemplateDue("custom", false, new Date("2026-01-03T05:00:00Z"), 3, jan1)).toBe(false);
  });
  it("يدعم أيام محددة من الأسبوع (specific_days)", () => {
    const monday = new Date("2026-08-17T05:00:00Z");
    const tuesday = new Date("2026-08-18T05:00:00Z");
    // يوم الاثنين فقط (بدون تقييد أيام العمل لعزل منطق اليوم)
    expect(isTemplateDue("specific_days", false, monday, null, null, [1])).toBe(true);
    expect(isTemplateDue("specific_days", false, tuesday, null, null, [1])).toBe(false);
    // بدون أيام محددة → لا تُنشأ
    expect(isTemplateDue("specific_days", false, monday, null, null, [])).toBe(false);
    expect(isTemplateDue("specific_days", false, monday, null, null, null)).toBe(false);
    // الجمعة ضمن الأيام المختارة (اليوم 5) → تُنشأ إذا لم يُقيّد بأيام العمل
    expect(isTemplateDue("specific_days", false, friday, null, null, [5])).toBe(true);
  });
  it("يقصر التنفيذ الفوري الوارد من المصدر المرتبط على نافذة السابعة إلى الثالثة", () => {
    expect(isWithinSaudiWorkHours(new Date("2026-08-16T04:00:00Z"))).toBe(true);
    expect(isWithinSaudiWorkHours(new Date("2026-08-16T12:00:00Z"))).toBe(false);
  });
  it("يرحّل التحديث الوارد خارج ساعات العمل إلى السابعة من يوم العمل التالي", () => {
    expect(nextSaudiWorkStart(new Date("2026-08-14T17:00:00Z")).toISOString()).toBe("2026-08-16T04:00:00.000Z");
  });
});

describe("منع تكرار القوالب اليومية (lastGeneratedAt)", () => {
  const sunday = new Date("2026-08-16T05:00:00Z");
  it("لا يُعيد توليد القالب اليومي إذا وُلِّد في نفس اليوم", () => {
    expect(isTemplateDue("daily", true, sunday, null, new Date("2026-08-16T04:00:00Z"))).toBe(false);
  });
  it("يُولِّد القالب اليومي إذا كان آخر توليد بالأمس", () => {
    expect(isTemplateDue("daily", true, sunday, null, new Date("2026-08-15T04:00:00Z"))).toBe(true);
  });
  it("يُولِّد القالب اليومي أول مرة (بدون lastGeneratedAt)", () => {
    expect(isTemplateDue("daily", true, sunday, null, null)).toBe(true);
  });
});
