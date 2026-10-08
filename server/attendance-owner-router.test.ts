import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: "employee" as string,
  roles: [] as string[],
  ownerEditAttendanceCheckIn: vi.fn(async () => ({ success: true, attendanceId: 5 })),
  ownerEditAttendanceCheckOut: vi.fn(async () => ({ success: true, attendanceId: 5 })),
  ownerCreateAttendanceRecord: vi.fn(async () => ({ success: true, attendanceId: 6 })),
  ownerDeleteAttendanceRecord: vi.fn(async () => ({ success: true })),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: vi.fn(async () => mocks.permission),
    getEffectiveRoles: vi.fn(async () => mocks.roles),
    ownerEditAttendanceCheckIn: mocks.ownerEditAttendanceCheckIn,
    ownerEditAttendanceCheckOut: mocks.ownerEditAttendanceCheckOut,
    ownerCreateAttendanceRecord: mocks.ownerCreateAttendanceRecord,
    ownerDeleteAttendanceRecord: mocks.ownerDeleteAttendanceRecord,
  };
});

import { courtRouter } from "./routers/court";

const ownerCaller = () => courtRouter.createCaller({ user: { id: 1, role: "user", email: "rakizaplatform@gmail.com", name: "مالك", openId: "owner" } } as never);
const employeeCaller = () => courtRouter.createCaller({ user: { id: 7, role: "user", email: "emp@court.example", name: "موظف", openId: "emp" } } as never);

describe("court.attendance.ownerEditCheckIn", () => {
  it("owner can edit any attendance record", async () => {
    mocks.permission = "full_control";
    mocks.roles = [];
    await expect(ownerCaller().attendance.ownerEditCheckIn({ profileId: 9, recordDate: new Date("2026-08-14T07:00:00Z"), checkInAt: new Date("2026-08-14T06:00:00Z"), reason: "تصحيح وقت الحضور بناءً على طلب الموظف." })).resolves.toEqual({ success: true, attendanceId: 5 });
    expect(mocks.ownerEditAttendanceCheckIn).toHaveBeenCalledWith(expect.objectContaining({ profileId: 9, actorUserId: 1 }));
  });

  it("non-owner cannot edit", async () => {
    mocks.permission = "employee";
    mocks.roles = [];
    await expect(employeeCaller().attendance.ownerEditCheckIn({ profileId: 9, recordDate: new Date("2026-08-14T07:00:00Z"), checkInAt: new Date("2026-08-14T06:00:00Z"), reason: "تصحيح وقت الحضور بناءً على طلب الموظف." })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("edit requires reason (min 10)", async () => {
    mocks.permission = "full_control";
    mocks.roles = [];
    mocks.ownerEditAttendanceCheckIn.mockClear();
    await expect(ownerCaller().attendance.ownerEditCheckIn({ profileId: 9, recordDate: new Date("2026-08-14T07:00:00Z"), checkInAt: new Date("2026-08-14T06:00:00Z"), reason: "قصير" })).rejects.toBeTruthy();
    expect(mocks.ownerEditAttendanceCheckIn).not.toHaveBeenCalled();
  });
});

describe("court.attendance.ownerDeleteRecord", () => {
  it("owner can delete any attendance record", async () => {
    mocks.permission = "full_control";
    mocks.roles = [];
    await expect(ownerCaller().attendance.ownerDeleteRecord({ recordId: 21, reason: "حذف سجل مكرر بناءً على مراجعة الأمين." })).resolves.toEqual({ success: true });
    expect(mocks.ownerDeleteAttendanceRecord).toHaveBeenCalledWith(expect.objectContaining({ recordId: 21, actorUserId: 1 }));
  });

  it("non-owner cannot delete", async () => {
    mocks.permission = "employee";
    mocks.roles = [];
    await expect(employeeCaller().attendance.ownerDeleteRecord({ recordId: 21, reason: "حذف سجل مكرر بناءً على مراجعة الأمين." })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
