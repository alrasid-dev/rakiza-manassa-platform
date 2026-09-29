import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: "general_view" as string,
  roles: [] as string[],
  assignments: [] as { role: string; unitId: number | null; isActive: boolean }[],
  meeting: { id: 7, title: "اجتماع قسم", unitId: 2 } as { id: number; title: string; unitId: number | null },
  getAccessPermission: vi.fn(async () => mocks.permission),
  getEffectiveRoles: vi.fn(async () => mocks.roles),
  getActiveCourtRoleAssignments: vi.fn(async () => mocks.assignments),
  getMeetingById: vi.fn(async () => mocks.meeting),
  addMeetingAttendees: vi.fn(async () => undefined),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: mocks.getAccessPermission,
    getEffectiveRoles: mocks.getEffectiveRoles,
    getActiveCourtRoleAssignments: mocks.getActiveCourtRoleAssignments,
    getMeetingById: mocks.getMeetingById,
    addMeetingAttendees: mocks.addMeetingAttendees,
  };
});

import { courtRouter } from "./routers/court";

const callerFor = (user: { id: number; role: "user" | "admin"; email: string | null }) =>
  courtRouter.createCaller({ user: { ...user, name: "مستخدم", openId: "openid" } } as never);

describe("عزل دعوة الحاضرين للاجتماعات", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission = "general_view";
    mocks.roles = [];
    mocks.assignments = [];
    mocks.meeting = { id: 7, title: "اجتماع قسم", unitId: 2 };
  });

  it("يسمح للمالك بدعوة حاضرين لأي اجتماع", async () => {
    const caller = callerFor({ id: 1, role: "admin", email: "owner@court.example" });
    await expect(caller.meetings.invite({ meetingId: 7, profileIds: [10, 11] })).resolves.toEqual({ success: true });
    expect(mocks.addMeetingAttendees).toHaveBeenCalledWith({ meetingId: 7, profileIds: [10, 11], actorUserId: 1 });
  });

  it("يمنع مدير قسم من دعوة حاضرين لاجتماع قسم آخر", async () => {
    mocks.permission = "general_view";
    mocks.roles = ["department_manager"];
    mocks.assignments = [{ role: "department_manager", unitId: 5, isActive: true }];
    mocks.meeting = { id: 7, title: "اجتماع قسم آخر", unitId: 2 };
    const caller = callerFor({ id: 6, role: "user", email: "manager5@court.example" });
    await expect(caller.meetings.invite({ meetingId: 7, profileIds: [10] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.addMeetingAttendees).not.toHaveBeenCalled();
  });
});
