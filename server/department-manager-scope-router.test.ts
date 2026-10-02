import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getManagedUnitDashboard: vi.fn(async () => ({ scope: "unit", profiles: 2, openTasks: 3, overdueTasks: 1, openDelays: 4, overdueDelays: 2 })),
  listTasksForUnits: vi.fn(async () => [{ id: 12, unitId: 44, title: "مهمة الوحدة" }]),
  listDelaysForUnits: vi.fn(async () => [{ id: 18, unitId: 44, title: "متعثر الوحدة" }]),
  getOperationalReport: vi.fn(async () => ({ period: "monthly", tasks: { total: 1, completed: 0, overdue: 0 }, delays: { total: 1, open: 1, overdue: 0 }, scores: { positive: 0, negative: 0 }, transfers: { ready: 0, notReady: 0 } })),
  listOrganizationUnits: vi.fn(async () => [{ id: 44, name: "وحدة المدير" }, { id: 55, name: "وحدة أخرى" }]),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: vi.fn(async () => "employee"),
    getEffectiveRoles: vi.fn(async () => ["department_manager"]),
    getActiveCourtRoleAssignments: vi.fn(async () => [{ role: "department_manager", unitId: 44 }]),
    getManagedUnitDashboard: mocks.getManagedUnitDashboard,
    listTasksForUnits: mocks.listTasksForUnits,
    listDelaysForUnits: mocks.listDelaysForUnits,
    getOperationalReport: mocks.getOperationalReport,
    listOrganizationUnits: mocks.listOrganizationUnits,
  };
});

import { courtRouter } from "./routers/court";

describe("مساحة مدير القسم", () => {
  it("تستعلم عن بيانات وحدته المفوضة فقط عبر لوحة العمل والمهام والمتعثرات والتقارير", async () => {
    const caller = courtRouter.createCaller({ user: { id: 7, role: "user", email: "manager@court.example", name: "مدير", openId: "manager" } } as never);
    await caller.dashboard();
    await caller.tasks.list();
    await caller.delays.list();
    await caller.reports.operational({ period: "monthly" });
    await expect(caller.units.list()).resolves.toEqual([{ id: 44, name: "وحدة المدير" }]);
    expect(mocks.getManagedUnitDashboard).toHaveBeenCalledWith([44], 7);
    expect(mocks.listTasksForUnits).toHaveBeenCalledWith([44], undefined, undefined, undefined, undefined);
    expect(mocks.listDelaysForUnits).toHaveBeenCalledWith([44], undefined);
    expect(mocks.getOperationalReport).toHaveBeenCalledWith(expect.objectContaining({ unitId: 44 }));
  });

  it("يرفض طلب تقرير لوحدة خارج التفويض", async () => {
    const caller = courtRouter.createCaller({ user: { id: 7, role: "user", email: "manager@court.example", name: "مدير", openId: "manager" } } as never);
    await expect(caller.reports.operational({ period: "monthly", unitId: 55 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
