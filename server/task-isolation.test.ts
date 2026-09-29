import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: "employee" as string,
  roles: [] as string[],
  assignments: [] as { role: string; unitId: number | null; isActive: boolean }[],
  task: { id: 44, title: "مهمة فعلية", unitId: 2, assigneeProfileId: 10, assignedByUserId: 1 } as { id: number; title: string; unitId: number | null; assigneeProfileId: number | null; assignedByUserId: number | null },
  profile: { id: 10, userId: 8, fullName: "المكلف", unitId: 2, status: "active" } as { id: number; userId: number; fullName: string; unitId: number | null; status: string },
  getAccessPermission: vi.fn(async () => mocks.permission),
  getEffectiveRoles: vi.fn(async () => mocks.roles),
  getActiveCourtRoleAssignments: vi.fn(async () => mocks.assignments),
  getTaskById: vi.fn(async () => mocks.task),
  getProfileForUser: vi.fn(async () => mocks.profile),
  getTaskDetails: vi.fn(async () => ({ id: 44, title: "مهمة فعلية" })),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: mocks.getAccessPermission,
    getEffectiveRoles: mocks.getEffectiveRoles,
    getActiveCourtRoleAssignments: mocks.getActiveCourtRoleAssignments,
    getTaskById: mocks.getTaskById,
    getProfileForUser: mocks.getProfileForUser,
    getTaskDetails: mocks.getTaskDetails,
  };
});

import { courtRouter } from "./routers/court";

const callerFor = (user: { id: number; role: "user" | "admin"; email: string | null }) =>
  courtRouter.createCaller({ user: { ...user, name: "مستخدم", openId: "openid" } } as never);

describe("عزل مهام الأقسام (canAccessTask)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission = "employee";
    mocks.roles = [];
    mocks.assignments = [];
    mocks.task = { id: 44, title: "مهمة فعلية", unitId: 2, assigneeProfileId: 10, assignedByUserId: 1 };
    mocks.profile = { id: 10, userId: 8, fullName: "المكلف", unitId: 2, status: "active" };
  });

  it("يمنع مدير قسم من الوصول لمهمة قسم آخر", async () => {
    mocks.permission = "general_view";
    mocks.roles = ["department_manager"];
    mocks.assignments = [{ role: "department_manager", unitId: 5, isActive: true }];
    mocks.task = { id: 44, title: "مهمة قسم آخر", unitId: 2, assigneeProfileId: 10, assignedByUserId: 1 };
    mocks.profile = { id: 50, userId: 6, fullName: "مدير القسم 5", unitId: 5, status: "active" };
    const caller = callerFor({ id: 6, role: "user", email: "manager5@court.example" });
    await expect(caller.tasks.details({ taskId: 44 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يسمح لمدير قسم بالوصول لمهمة قسمه", async () => {
    mocks.permission = "general_view";
    mocks.roles = ["department_manager"];
    mocks.assignments = [{ role: "department_manager", unitId: 5, isActive: true }];
    mocks.task = { id: 44, title: "مهمة قسمي", unitId: 5, assigneeProfileId: 10, assignedByUserId: 1 };
    mocks.profile = { id: 50, userId: 6, fullName: "مدير القسم 5", unitId: 5, status: "active" };
    const caller = callerFor({ id: 6, role: "user", email: "manager5@court.example" });
    await expect(caller.tasks.details({ taskId: 44 })).resolves.toEqual({ id: 44, title: "مهمة فعلية" });
  });

  it("يسمح للمالك بالوصول لمهمة أي قسم", async () => {
    mocks.task = { id: 44, title: "مهمة", unitId: 2, assigneeProfileId: 10, assignedByUserId: 1 };
    mocks.profile = { id: 50, userId: 1, fullName: "مالك", unitId: 2, status: "active" };
    const caller = callerFor({ id: 1, role: "admin", email: "owner@court.example" });
    await expect(caller.tasks.details({ taskId: 44 })).resolves.toEqual({ id: 44, title: "مهمة فعلية" });
  });

  it("يسمح للموظف بالوصول لمهمته", async () => {
    mocks.permission = "employee";
    mocks.roles = [];
    mocks.assignments = [];
    mocks.task = { id: 44, title: "مهمتي", unitId: 2, assigneeProfileId: 10, assignedByUserId: 1 };
    mocks.profile = { id: 10, userId: 8, fullName: "المكلف", unitId: 2, status: "active" };
    const caller = callerFor({ id: 8, role: "user", email: "employee@court.example" });
    await expect(caller.tasks.details({ taskId: 44 })).resolves.toEqual({ id: 44, title: "مهمة فعلية" });
  });
});
