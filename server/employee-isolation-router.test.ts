import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listProfilesForUnits: vi.fn(async () => [{ id: 22, fullName: "ملازم قضائي", personType: "trainee" }]),
  listTasksForProfile: vi.fn(async () => []),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: vi.fn(async () => "employee"),
    getEffectiveRoles: vi.fn(async () => []),
    getActiveCourtRoleAssignments: vi.fn(async () => []),
    getProfileForUser: vi.fn(async () => ({ id: 9, fullName: "موظف إداري", personType: "administrative", unitId: 1 })),
    listProfilesForUnits: mocks.listProfilesForUnits,
    listTasksForProfile: mocks.listTasksForProfile,
  };
});

import { courtRouter } from "./routers/court";

describe("عزل الموظف الإداري", () => {
  it("يعرض ملفه فقط ويقصر المهام على ملفه ويحجب التقارير", async () => {
    const caller = courtRouter.createCaller({ user: { id: 7, role: "user", email: "employee@court.example", name: "موظف", openId: "employee" } } as never);

    const people = await caller.people.list();
    await caller.tasks.list();

    expect(people.map(person => person.id)).toEqual([9]);
    expect(mocks.listProfilesForUnits).not.toHaveBeenCalled();
    expect(mocks.listTasksForProfile).toHaveBeenCalledWith(9, undefined, undefined, undefined, undefined);
    await expect(caller.reports.operational({ period: "daily" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
