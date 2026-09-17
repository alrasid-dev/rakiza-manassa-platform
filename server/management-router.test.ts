import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDepartmentManagerAssignments: vi.fn(async () => []),
  assignDepartmentManager: vi.fn(async () => ({ assignmentId: 51 })),
  endDepartmentManagerAssignment: vi.fn(async () => ({ success: true as const })),
  getEffectiveRoles: vi.fn(async (_userId: number) => [] as string[]),
  getAccessPermission: vi.fn(async (_email: string | null) => "general_view" as const),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    listDepartmentManagerAssignments: mocks.listDepartmentManagerAssignments,
    assignDepartmentManager: mocks.assignDepartmentManager,
    endDepartmentManagerAssignment: mocks.endDepartmentManagerAssignment,
    getEffectiveRoles: mocks.getEffectiveRoles,
    getAccessPermission: mocks.getAccessPermission,
  };
});

import { courtRouter } from "./routers/court";

const OWNER_EMAIL = "rakizaplatform@gmail.com";

function callerFor(id: number, email: string, role: "user" | "admin" = "user") {
  return courtRouter.createCaller({ user: { id, role, email, name: email, openId: `open-${id}` } } as never);
}

describe("إدارة تكليف المدراء (court.management)", () => {
  beforeEach(() => {
    mocks.listDepartmentManagerAssignments.mockClear();
    mocks.assignDepartmentManager.mockClear();
    mocks.endDepartmentManagerAssignment.mockClear();
    mocks.getEffectiveRoles.mockReset();
    mocks.getAccessPermission.mockReset();
  });

  it("يسمح لرئيس المحكمة بتكليف مدير قسم وإنهاء التكليف", async () => {
    mocks.getEffectiveRoles.mockResolvedValue(["court_president"]);
    mocks.getAccessPermission.mockResolvedValue("general_view");
    const president = callerFor(2, "snaswig@moj.gov.sa");

    await expect(president.management.assign({ userId: 6, unitId: 3 })).resolves.toEqual({ assignmentId: 51 });
    expect(mocks.assignDepartmentManager).toHaveBeenCalledWith({ userId: 6, unitId: 3, delegatedByUserId: 2 });

    await expect(president.management.end({ assignmentId: 51 })).resolves.toEqual({ success: true });
    expect(mocks.endDepartmentManagerAssignment).toHaveBeenCalledWith({ assignmentId: 51, actorUserId: 2 });
  });

  it("يسمح للأمين العام (court_secretary) بعرض التكليفات وإنهائها", async () => {
    mocks.getEffectiveRoles.mockResolvedValue(["court_secretary"]);
    mocks.getAccessPermission.mockResolvedValue("general_view");
    const secretary = callerFor(4, "abssotaibi@moj.gov.sa");

    await expect(secretary.management.list()).resolves.toEqual([]);
    expect(mocks.listDepartmentManagerAssignments).toHaveBeenCalled();
    await expect(secretary.management.end({ assignmentId: 51 })).resolves.toEqual({ success: true });
  });

  it("يحجب مدير القسم العادي عن إدارة تكليف المدراء", async () => {
    mocks.getEffectiveRoles.mockResolvedValue(["department_manager"]);
    mocks.getAccessPermission.mockResolvedValue("employee" as any);
    const manager = callerFor(6, "amhumaidi@moj.gov.sa");

    await expect(manager.management.assign({ userId: 5, unitId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(manager.management.end({ assignmentId: 51 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.assignDepartmentManager).not.toHaveBeenCalled();
    expect(mocks.endDepartmentManagerAssignment).not.toHaveBeenCalled();
  });

  it("يسمح للمالك بتكليف مدير قسم", async () => {
    mocks.getAccessPermission.mockResolvedValue("general_view");
    const owner = callerFor(1, OWNER_EMAIL);
    await expect(owner.management.assign({ userId: 9, unitId: 6 })).resolves.toEqual({ assignmentId: 51 });
    expect(mocks.assignDepartmentManager).toHaveBeenCalledWith({ userId: 9, unitId: 6, delegatedByUserId: 1 });
  });
});
