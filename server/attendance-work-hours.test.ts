import { describe, expect, it } from "vitest";
import { checkAttendanceWindow } from "./court-service";

// التواريخ: 2026-09-27 أحد، 2026-09-25 جمعة، 2026-09-23 الأربعاء (اليوم الوطني)، 2026-03-19 خميس (رمضان)
describe("checkAttendanceWindow (ساعات العمل الرسمية)", () => {
  it("يرفض تسجيل الحضور قبل بداية الدوام بفترة سماح 15 دقيقة", () => {
    const before = new Date("2026-09-27T03:30:00Z"); // 06:30 الرياض
    expect(checkAttendanceWindow(before, "check_in").allowed).toBe(false);
  });
  it("يقبل تسجيل الحضور في الوقت مع تمييز التأخير", () => {
    const onTime = new Date("2026-09-27T04:00:00Z"); // 07:00 الرياض
    const late = new Date("2026-09-27T05:00:00Z"); // 08:00 الرياض
    expect(checkAttendanceWindow(onTime, "check_in")).toMatchObject({ allowed: true, isLate: false });
    expect(checkAttendanceWindow(late, "check_in")).toMatchObject({ allowed: true, isLate: true });
  });
  it("يرفض التسجيل يوم الجمعة (عطلة)", () => {
    const friday = new Date("2026-09-25T04:00:00Z");
    expect(checkAttendanceWindow(friday, "check_in").allowed).toBe(false);
  });
  it("يرفض التسجيل يوم إجازة رسمية (اليوم الوطني)", () => {
    const nationalDay = new Date("2026-09-23T04:00:00Z"); // الأربعاء
    expect(checkAttendanceWindow(nationalDay, "check_in").allowed).toBe(false);
  });
  it("يرفض الانصراف قبل نهاية الدوام - 15 دقيقة", () => {
    const early = new Date("2026-09-27T11:00:00Z"); // 14:00 الرياض
    expect(checkAttendanceWindow(early, "check_out").allowed).toBe(false);
    const after = new Date("2026-09-27T12:00:00Z"); // 15:00 الرياض
    expect(checkAttendanceWindow(after, "check_out").allowed).toBe(true);
  });
  it("يطبّق ساعات رمضان (10:00 - 15:00)", () => {
    const before = new Date("2026-03-19T06:30:00Z"); // 09:30 الرياض
    expect(checkAttendanceWindow(before, "check_in").allowed).toBe(false);
    const onTime = new Date("2026-03-19T07:00:00Z"); // 10:00 الرياض
    expect(checkAttendanceWindow(onTime, "check_in").allowed).toBe(true);
  });
});
