import { describe, expect, it } from "vitest";

import { checkAttendanceWindow } from "./court-service";

// التواريخ: 2026-09-27 أحد، 2026-09-25 جمعة، 2026-09-23 الأربعاء (اليوم الوطني)
describe("checkAttendanceWindow (سياسة البصمة الدقيقة)", () => {
  it("يرفض تسجيل الحضور قبل فتح البصمة (07:00)", async () => {
    const before = new Date("2026-09-27T03:30:00Z"); // 06:30 الرياض
    expect((await checkAttendanceWindow(before, "check_in")).allowed).toBe(false);
  });
  it("يقبل الحضور من 07:00 حتى 14:59 مع تمييز التأخير بعد 08:15", async () => {
    const onTime = new Date("2026-09-27T04:00:00Z"); // 07:00 الرياض
    const lateNoPenalty = new Date("2026-09-27T05:05:00Z"); // 08:05 الرياض (متأخر بلا خصم)
    const late = new Date("2026-09-27T05:20:00Z"); // 08:20 الرياض (متأخر)
    const veryLate = new Date("2026-09-27T11:00:00Z"); // 14:00 الرياض (متأخر)
    expect(await checkAttendanceWindow(onTime, "check_in")).toMatchObject({ allowed: true, isLate: false });
    expect(await checkAttendanceWindow(lateNoPenalty, "check_in")).toMatchObject({ allowed: true, isLate: false });
    expect(await checkAttendanceWindow(late, "check_in")).toMatchObject({ allowed: true, isLate: true });
    expect(await checkAttendanceWindow(veryLate, "check_in")).toMatchObject({ allowed: true, isLate: true });
  });
  it("يرفض تسجيل الحضور بعد 15:00", async () => {
    const after = new Date("2026-09-27T12:30:00Z"); // 15:30 الرياض
    expect((await checkAttendanceWindow(after, "check_in")).allowed).toBe(false);
  });
  it("يرفض التسجيل يوم الجمعة (عطلة)", async () => {
    const friday = new Date("2026-09-25T04:00:00Z");
    expect((await checkAttendanceWindow(friday, "check_in")).allowed).toBe(false);
  });
  it("يرفض التسجيل يوم إجازة رسمية (اليوم الوطني)", async () => {
    const nationalDay = new Date("2026-09-23T04:00:00Z");
    expect((await checkAttendanceWindow(nationalDay, "check_in")).allowed).toBe(false);
  });
  it("يقبل الانصراف المبكر من 07:00 (سلبي) ويرفض قبل 07:00", async () => {
    const early = new Date("2026-09-27T07:00:00Z"); // 10:00 الرياض (انصراف مبكر)
    expect((await checkAttendanceWindow(early, "check_out")).allowed).toBe(true);
    const before = new Date("2026-09-27T03:30:00Z"); // 06:30 الرياض
    expect((await checkAttendanceWindow(before, "check_out")).allowed).toBe(false);
  });
  it("يقبل الانصراف في النافذة 14:15–14:59 ويرفض بعد غلق البصمة", async () => {
    const onTime = new Date("2026-09-27T11:20:00Z"); // 14:20 الرياض
    expect((await checkAttendanceWindow(onTime, "check_out")).allowed).toBe(true);
    const after = new Date("2026-09-27T12:30:00Z"); // 15:30 الرياض
    expect((await checkAttendanceWindow(after, "check_out")).allowed).toBe(false);
  });
});

