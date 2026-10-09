import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccessPermission: vi.fn(async () => "employee" as const),
  getTaskById: vi.fn(async () => ({ id: 1, title: "مهمة", unitId: 5, status: "new", assigneeProfileId: 20 })),
  getEffectiveRoles: vi.fn(async () => [] as string[]),
  getActiveCourtRoleAssignments: vi.fn(async () => []),
  reassignTaskManual: vi.fn(async () => ({ success: true, taskId: 1, oldAssigneeName: null, newAssigneeName: "موظفة" })),
}));

vi.mock("./court-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: mocks.getAccessPermission,
    getTaskById: mocks.getTaskById,
    getEffectiveRoles: mocks.getEffectiveRoles,
    getActiveCourtRoleAssignments: mocks.getActiveCourtRoleAssignments,
    reassignTaskManual: mocks.reassignTaskManual,
  };
});

import { courtRouter } from "./routers/court";

describe("court.tasks.reassignTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessPermission.mockResolvedValue("employee");
    mocks.getTaskById.mockResolvedValue({ id: 1, title: "مهمة", unitId: 5, status: "new", assigneeProfileId: 20 });
    mocks.getEffectiveRoles.mockResolvedValue([]);
    mocks.getActiveCourtRoleAssignments.mockResolvedValue([]);
    mocks.reassignTaskManual.mockResolvedValue({ success: true, taskId: 1, oldAssigneeName: null, newAssigneeName: "موظفة" });
  });

  it("manager can reassign task manually (full_control)", async () => {
    const caller = courtRouter.createCaller({ user: { id: 1, role: "admin", email: "owner@court.example", name: "مالك", openId: "owner" } } as never);

    await caller.tasks.reassignTask({ taskId: 1, newAssigneeProfileId: 30, reason: "نقل المهمة بسبب عبء العمل" });

    expect(mocks.reassignTaskManual).toHaveBeenCalledWith({ taskId: 1, newAssigneeProfileId: 30, reason: "نقل المهمة بسبب عبء العمل", actorUserId: 1, durationDays: null });
  });

  it("non-manager cannot reassign", async () => {
    mocks.getAccessPermission.mockResolvedValue("employee");
    const caller = courtRouter.createCaller({ user: { id: 2, role: "user", email: "emp@court.example", name: "موظف", openId: "emp" } } as never);

    await expect(caller.tasks.reassignTask({ taskId: 1, newAssigneeProfileId: 30, reason: "نقل المهمة بسبب عبء العمل" })).rejects.toThrow();
    expect(mocks.reassignTaskManual).not.toHaveBeenCalled();
  });
});
