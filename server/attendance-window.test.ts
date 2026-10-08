import { describe, expect, it } from "vitest";
import { attendanceWindowKindForShift } from "./court-service";

const shift = {
  workingDays: "0,1,2,3,4",
  fingerprintOpenMinutes: 420,
  morningCompensationDeadlineMinutes: 570,
  actualEndMinutes: 840,
  fingerprintCloseMinutes: 960,
};

describe("نافذة الحضور والانصراف بحسب الوردية", () => {
  it("تظهر الحضور من فتح البصمة حتى قبل الانصراف، والانصراف حتى غلق البصمة", () => {
    expect(attendanceWindowKindForShift(shift, new Date("2026-08-30T04:30:00.000Z"))).toBe("check_in"); // 07:30 الرياض
    expect(attendanceWindowKindForShift(shift, new Date("2026-08-30T08:00:00.000Z"))).toBe("check_in"); // 11:00 الرياض (دخول متأخر)
    expect(attendanceWindowKindForShift(shift, new Date("2026-08-30T12:30:00.000Z"))).toBe("check_out"); // 15:30 الرياض
  });

  it("لا تظهر قبل فتح البصمة أو بعد غلقها أو في يوم غير عامل", () => {
    expect(attendanceWindowKindForShift(shift, new Date("2026-08-30T03:00:00.000Z"))).toBe("none"); // 06:00 الرياض
    expect(attendanceWindowKindForShift(shift, new Date("2026-08-30T14:00:00.000Z"))).toBe("none"); // 17:00 الرياض (بعد غلق البصمة)
    expect(attendanceWindowKindForShift(shift, new Date("2026-08-28T04:30:00.000Z"))).toBe("none"); // جمعة
  });
});
