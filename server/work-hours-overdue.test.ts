import { describe, expect, it } from "vitest";
import { calculateWorkMinutesBetween } from "./court-service";

describe("calculateWorkMinutesBetween — ساعات العمل بين لحظتين", () => {
  it("يحتسب ساعات الدوام 07:00–14:15 بتوقيت الرياض في يوم عمل", () => {
    // الأحد 2026-09-27: 08:00 الرياض = 05:00 UTC، 14:15 الرياض = 11:15 UTC
    const start = new Date("2026-09-27T05:00:00Z");
    const end = new Date("2026-09-27T11:15:00Z");
    expect(calculateWorkMinutesBetween(start, end)).toBe(375);
  });

  it("يستبعد الجمعة والسبت من الحساب", () => {
    // الخميس 2026-10-01 08:00 الرياض → الأحد 2026-10-04 07:00 الرياض (فيهما جمعة وسبت، والأحد يبدأ قبل الدوام)
    const start = new Date("2026-10-01T05:00:00Z");
    const end = new Date("2026-10-04T04:00:00Z");
    // الخميس فقط: 08:00→14:30 = 390 دقيقة (نافذة 14:15 + مهلة خروج 15 دقيقة؛ الجمعة والسبت غير محسوبة)
    expect(calculateWorkMinutesBetween(start, end)).toBe(390);
  });

  it("يعيد 0 عندما يكون البدء بعد النهاية", () => {
    expect(calculateWorkMinutesBetween(new Date("2026-09-27T11:15:00Z"), new Date("2026-09-27T05:00:00Z"))).toBe(0);
  });
});
