import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ permission: "employee" as string }));

const mocks = vi.hoisted(() => ({
  listAdministrativeSubstitutes: vi.fn(async () => [{ id: 14, fullName: "موظف بديل" }]),
  listPlatformSubstitutes: vi.fn(async () => [{ id: 20, fullName: "بديل على مستوى المنصة" }]),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: vi.fn(async () => state.permission),
    getProfileForUser: vi.fn(async () => ({ id: 9, fullName: "موظف إداري", personType: "administrative", unitId: 1 })),
    listAdministrativeSubstitutes: mocks.listAdministrativeSubstitutes,
    listPlatformSubstitutes: mocks.listPlatformSubstitutes,
  };
});

import { courtRouter } from "./routers/court";

describe("court.leave.substitutes", () => {
  beforeEach(() => { state.permission = "employee"; mocks.listAdministrativeSubstitutes.mockClear(); mocks.listPlatformSubstitutes.mockClear(); });

  it("يعيد بدلاء الموظف الإداري ضمن وحدته فقط", async () => {
    const caller = courtRouter.createCaller({ user: { id: 7, role: "user", email: "employee@court.example", name: "موظف", openId: "employee" } } as never);
    const substitutes = await caller.leave.substitutes();

    expect(mocks.listAdministrativeSubstitutes).toHaveBeenCalledWith(1, 9);
    expect(mocks.listPlatformSubstitutes).not.toHaveBeenCalled();
    expect(substitutes).toEqual([{ id: 14, fullName: "موظف بديل" }]);
  });

  it("يعيد بدلاء على مستوى المنصة كاملة لحسابات القيادة", async () => {
    const caller = courtRouter.createCaller({ user: { id: 1, role: "admin", email: "owner@court.example", name: "المالك", openId: "owner" } } as never);
    const substitutes = await caller.leave.substitutes();

    expect(mocks.listPlatformSubstitutes).toHaveBeenCalledWith(9);
    expect(substitutes).toEqual([{ id: 20, fullName: "بديل على مستوى المنصة" }]);
  });
});
