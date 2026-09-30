import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              fingerprintOpenMinutes: 420,
              startMinutes: 450,
              lateStartMinutes: 480,
              morningCompensationDeadlineMinutes: 495,
              endMinutes: 930,
              actualEndMinutes: 930,
              eveningCompensationDeadlineMinutes: 945,
              fingerprintCloseMinutes: 960,
            },
          ],
        }),
      }),
    }),
  })),
}));

import { checkAttendanceWindow } from "./court-service";

// التواريخ: 2026-09-27 أحد، 2026-09-25 جمعة، 2026-09-23 الأربعاء (اليوم الوطني)
describe("checkAttendanceWindow (نافذة الوردية)", () => {
  it("يرفض تسجيل الحضور قبل فتح البصمة (07:00)", async () => {
    const before = new Date("2026-09-27T03:30:00Z"); // 06:30 الرياض
    expect((await checkAttendanceWindow(before, "check_in")).allowed).toBe(false);
  });
  it("يقبل تسجيل الحضور في النافذة مع تمييز التأخير", async () => {
    const onTime = new Date("2026-09-27T04:00:00Z"); // 07:00 الرياض
    const late = new Date("2026-09-27T05:10:00Z"); // 08:10 الرياض
    expect(await checkAttendanceWindow(onTime, "check_in")).toMatchObject({ allowed: true, isLate: false });
    expect(await checkAttendanceWindow(late, "check_in")).toMatchObject({ allowed: true, isLate: true });
  });
  it("يرفض تسجيل الحضور بعد آخر تعويض (08:15)", async () => {
    const after = new Date("2026-09-27T05:20:00Z"); // 08:20 الرياض
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
  it("يرفض الانصراف قبل نهاية الدوام الفعلية - 5 دقائق", async () => {
    const early = new Date("2026-09-27T12:20:00Z"); // 15:20 الرياض
    expect((await checkAttendanceWindow(early, "check_out")).allowed).toBe(false);
  });
  it("يقبل الانصراف في النافذة ويرفض بعد غلق البصمة (16:00)", async () => {
    const onTime = new Date("2026-09-27T12:30:00Z"); // 15:30 الرياض
    expect((await checkAttendanceWindow(onTime, "check_out")).allowed).toBe(true);
    const after = new Date("2026-09-27T13:10:00Z"); // 16:10 الرياض
    expect((await checkAttendanceWindow(after, "check_out")).allowed).toBe(false);
  });
});

