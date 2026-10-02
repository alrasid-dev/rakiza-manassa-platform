import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listProfilesForUnits: vi.fn(async () => [{ id: 22, fullName: "ملازم قضائي", personType: "trainee" }]),
  listTasksForProfile: vi.fn(async (profileId: number) => [{ id: profileId * 10, assigneeProfileId: profileId }]),
  listDelaysForProfile: vi.fn(async (profileId: number) => [{ id: profileId * 100, relatedProfileId: profileId }]),
  listLeaveRequestsForProfile: vi.fn(async (profileId: number) => [{ id: profileId * 1000, profileId }]),
  searchInternalPeople: vi.fn(async (input: { query?: string; unitId?: number }) => [{ profile: { id: 31, fullName: "زميل من القسم", email: "colleague@moj.gov.sa" }, unitName: input.unitId === 4 ? "قسم الاختبار" : "" }]),
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
    listDelaysForProfile: mocks.listDelaysForProfile,
    listLeaveRequestsForProfile: mocks.listLeaveRequestsForProfile,
    searchInternalPeople: mocks.searchInternalPeople,
  };
});

vi.mock("./internal-communications-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./internal-communications-service")>();
  return { ...actual, searchInternalPeople: mocks.searchInternalPeople };
});

import { courtRouter } from "./routers/court";

describe("court.people.list للموظف الإداري", () => {
  it("يعيد ملف الموظف فقط ولا يكشف ملفات ملازمي الوحدة", async () => {
    const caller = courtRouter.createCaller({ user: { id: 7, role: "user", email: "employee@court.example", name: "موظف", openId: "employee" } } as never);
    const people = await caller.people.list();

    expect(mocks.listProfilesForUnits).not.toHaveBeenCalled();
    expect(people.map(person => person.id)).toEqual([9]);
  });

  it("يتجاهل معرف مكلف آخر في قائمة المهام ويعيد مهام ملفه فقط", async () => {
    const caller = courtRouter.createCaller({ user: { id: 7, role: "user", email: "employee@court.example", name: "موظف", openId: "employee" } } as never);
    const tasks = await caller.tasks.list({ assigneeProfileId: 22 });

    expect(mocks.listTasksForProfile).toHaveBeenCalledWith(9, undefined, undefined);
    expect(tasks).toEqual([{ id: 90, assigneeProfileId: 9 }]);
  });

  it("يمرر البحث والقسم المحدد دون طلب قائمة عامة", async () => {
    const caller = courtRouter.createCaller({ user: { id: 7, role: "user", email: "employee@court.example", name: "موظف", openId: "employee" } } as never);
    const results = await caller.communications.peopleSearch({ query: "زميل", unitId: 4 });
    expect(mocks.searchInternalPeople).toHaveBeenCalledWith({ userId: 7, query: "زميل", unitId: 4 });
    expect(results[0].unitName).toBe("قسم الاختبار");
  });

  it("يحصر المتعثرات وطلبات الإجازة في الملف الشخصي نفسه", async () => {
    const caller = courtRouter.createCaller({ user: { id: 7, role: "user", email: "employee@court.example", name: "موظف", openId: "employee" } } as never);
    const delays = await caller.delays.list();
    const leave = await caller.leave.list();

    expect(mocks.listDelaysForProfile).toHaveBeenCalledWith(9);
    expect(mocks.listLeaveRequestsForProfile).toHaveBeenCalledWith(9);
    expect(delays).toEqual([{ id: 900, relatedProfileId: 9 }]);
    expect(leave).toEqual([{ id: 9000, profileId: 9 }]);
  });
});
