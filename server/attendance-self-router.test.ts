import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordAttendance: vi.fn(async () => undefined),
  recordAttendanceCheckout: vi.fn(async () => ({ success: true, attendanceId: 91 })),
  getAttendanceWindowForProfile: vi.fn(async () => ({ kind: "check_in" as const, shiftName: "الوردية الأساسية" })),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: vi.fn(async () => "employee"),
    getEffectiveRoles: vi.fn(async () => []),
    getProfileForUser: vi.fn(async () => ({ id: 9, fullName: "موظف عن بعد", personType: "administrative", attendanceMode: "remote", unitId: 1 })),
    recordAttendance: mocks.recordAttendance,
    recordAttendanceCheckout: mocks.recordAttendanceCheckout,
    getAttendanceWindowForProfile: mocks.getAttendanceWindowForProfile,
  };
});

import { courtRouter } from "./routers/court";

const caller = () => courtRouter.createCaller({ user: { id: 7, role: "user", email: "remote@court.example", name: "موظف", openId: "remote" } } as never);

describe("court.attendance.record", () => {
  it("يسمح للعامل عن بعد بتسجيل حضوره في ملفه المرتبط فقط", async () => {
    await expect(caller().attendance.record({ profileId: 9, recordDate: new Date("2026-08-14T07:00:00Z"), status: "present" })).resolves.toEqual({ success: true });
    expect(mocks.recordAttendance).toHaveBeenCalledWith(expect.objectContaining({ profileId: 9, actorUserId: 7, status: "present", recordDate: expect.any(Date), checkInAt: expect.any(Date) }));
  });

  it("يرفض تسجيل العامل عن بعد حضور ملف مختلف", async () => {
    await expect(caller().attendance.record({ profileId: 10, recordDate: new Date("2026-08-14T07:00:00Z"), status: "present" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يرفض تسجيل الحضور الذاتي خارج نافذة حضور الوردية", async () => {
    mocks.getAttendanceWindowForProfile.mockResolvedValueOnce({ kind: "none", shiftName: "الوردية الأساسية", workingDay: false } as any);
    await expect(caller().attendance.record({ profileId: 9, recordDate: new Date("2026-08-14T07:00:00Z"), status: "present" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});


describe("court.attendance.checkout", () => {
  it("يسجل انصراف العامل عن بعد لملفه المرتبط فقط", async () => {
    mocks.getAttendanceWindowForProfile.mockResolvedValueOnce({ kind: "check_out", shiftName: "الوردية الأساسية" } as any);
    await expect(caller().attendance.checkout()).resolves.toEqual({ success: true, attendanceId: 91 });
    expect(mocks.recordAttendanceCheckout).toHaveBeenCalledWith(expect.objectContaining({ profileId: 9, actorUserId: 7 }));
  });

  it("يرفض تسجيل الانصراف الذاتي خارج نافذة الانصراف", async () => {
    mocks.getAttendanceWindowForProfile.mockResolvedValueOnce({ kind: "check_in", shiftName: "الوردية الأساسية" });
    await expect(caller().attendance.checkout()).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
