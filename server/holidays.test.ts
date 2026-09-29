import { describe, expect, it } from "vitest";
import { hijriParts, isOfficialHoliday, isRamadan, NORMAL_WORK_HOURS, officialHolidayName, RAMADAN_WORK_HOURS, workHoursFor } from "./holidays";

describe("الإجازات الرسمية السعودية ورمضان", () => {
  it("يكتشف رمضان (الشهر التاسع) بتوقيت الرياض", () => {
    // 2026-03-19 يوافق 30 رمضان 1447
    expect(isRamadan(new Date("2026-03-19T12:00:00Z"))).toBe(true);
    // 2026-04-15 يوافق شوال (بعد العيد)
    expect(isRamadan(new Date("2026-04-15T12:00:00Z"))).toBe(false);
  });

  it("يُرجع ساعات عمل مخففة في رمضان", () => {
    expect(workHoursFor(new Date("2026-03-19T12:00:00Z"))).toEqual(RAMADAN_WORK_HOURS);
    expect(workHoursFor(new Date("2026-04-15T12:00:00Z"))).toEqual(NORMAL_WORK_HOURS);
  });

  it("يتعرف على اليوم الوطني ويوم التأسيس", () => {
    expect(officialHolidayName(new Date("2026-09-23T12:00:00Z"))).toBe("اليوم الوطني");
    expect(officialHolidayName(new Date("2026-02-22T12:00:00Z"))).toBe("يوم التأسيس");
    expect(isOfficialHoliday(new Date("2026-09-23T12:00:00Z"))).toBe(true);
  });

  it("يتعرف على عيد الفطر (1 شوال) عبر أم القرى", () => {
    const eid = [19, 20, 21, 22, 23]
      .map(d => new Date(`2026-03-${d}T12:00:00Z`))
      .find(d => { const h = hijriParts(d); return h.month === 10 && h.day === 1; })!;
    expect(eid).toBeTruthy();
    expect(officialHolidayName(eid)).toBe("عيد الفطر");
  });

  it("اليوم غير المعطّل لا يعتبر إجازة", () => {
    expect(isOfficialHoliday(new Date("2026-07-15T12:00:00Z"))).toBe(false);
  });
});
