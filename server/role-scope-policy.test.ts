import { describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";

const OWNER_EMAIL = ENV.platformOwnerEmail;

const mocks = vi.hoisted(() => ({
  listProfiles: vi.fn(async () => [{ id: 1, fullName: "ملف شامل" }]),
  listProfilesForUnits: vi.fn(async () => [{ id: 2, fullName: "موظف الوحدة" }]),
  listTraineesForJudge: vi.fn(async () => [{ id: 3, fullName: "المتدرب المرتبط" }]),
  listTasksForProfile: vi.fn(async () => [{ id: 21, assigneeProfileId: 3, title: "مهمة المتدرب" }]),
  listTasks: vi.fn(async () => [{ id: 21, assigneeProfileId: 3, title: "مهمة المتدرب" }]),
  listTasksForUnits: vi.fn(async () => [{ id: 12, unitId: 5, title: "مهمة الوحدة" }]),
  listDelaysForProfile: vi.fn(async () => [{ id: 31, relatedProfileId: 3, status: "overdue" }]),
  listPlatformModules: vi.fn(async () => [{ id: 7, moduleKey: "future-module", label: "وحدة مستقبلية" }]),
  createPlatformModule: vi.fn(async () => 8),
  updatePlatformModule: vi.fn(async () => ({ success: true })),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: vi.fn(async () => "employee"),
    getEffectiveRoles: vi.fn(async () => []),
    getProfileForUser: vi.fn(async (userId: number) => userId === 30 ? { id: 30, personType: "judge", fullName: "القاضي المرتبط", unitId: 4 } : { id: 9, personType: "administrative", fullName: "موظف", unitId: 44 }),
    getActiveCourtRoleAssignments: vi.fn(async (userId: number) => userId === 12 ? [{ role: "department_manager", unitId: 44 }] : []),
    listProfiles: mocks.listProfiles,
    listProfilesForUnits: mocks.listProfilesForUnits,
    listTraineesForJudge: mocks.listTraineesForJudge,
    listTasksForProfile: mocks.listTasksForProfile,
    listTasks: mocks.listTasks,
    listTasksForUnits: mocks.listTasksForUnits,
    listDelaysForProfile: mocks.listDelaysForProfile,
    listPlatformModules: mocks.listPlatformModules,
    createPlatformModule: mocks.createPlatformModule,
    updatePlatformModule: mocks.updatePlatformModule,
  };
});

import { courtRouter } from "./routers/court";

const caller = (user: { id: number; role: "user" | "admin"; email: string }) => courtRouter.createCaller({ user: { ...user, name: user.email, openId: user.email } } as never);

describe("سياسة نطاق الأدوار الجديدة", () => {
  it("يمنح أمين المحكمة الرؤية الشاملة صراحةً دون الاعتماد على general_view", async () => {
    const service = await import("./court-service");
    vi.mocked(service.getEffectiveRoles).mockResolvedValueOnce(["court_secretary"]);
    await expect(caller({ id: 11, role: "user", email: "secretary@court.example" }).people.list()).resolves.toEqual([{ id: 1, fullName: "ملف شامل" }]);
    expect(mocks.listProfiles).toHaveBeenCalled();
  });

  it("يحصر مدير القسم في موظفي وحدته", async () => {
    const service = await import("./court-service");
    vi.mocked(service.getEffectiveRoles).mockResolvedValueOnce(["department_manager"]);
    await expect(caller({ id: 12, role: "user", email: "manager@court.example" }).people.list({ personType: "administrative" })).resolves.toEqual([{ id: 2, fullName: "موظف الوحدة" }]);
    expect(mocks.listProfilesForUnits).toHaveBeenCalledWith([44], "administrative");
    await expect(caller({ id: 12, role: "user", email: "manager@court.example" }).people.list({ personType: "trainee" })).resolves.toEqual([]);
  });

  it("يحصر القاضي في الملازمين المرتبطين به فقط", async () => {
    const service = await import("./court-service");
    vi.mocked(service.getEffectiveRoles).mockResolvedValue(["judge"]);
    await expect(caller({ id: 30, role: "user", email: "judge@court.example" }).people.list({ personType: "trainee" })).resolves.toEqual([{ id: 3, fullName: "المتدرب المرتبط" }]);
    expect(mocks.listTraineesForJudge).toHaveBeenCalledWith(30);
    await expect(caller({ id: 30, role: "user", email: "judge@court.example" }).tasks.list()).resolves.toEqual([{ id: 21, assigneeProfileId: 3, title: "مهمة المتدرب" }]);
    await expect(caller({ id: 30, role: "user", email: "judge@court.example" }).delays.list({ status: "overdue" })).resolves.toEqual([{ id: 31, relatedProfileId: 3, status: "overdue" }]);
    expect(mocks.listTasks).toHaveBeenCalledWith({ assigneeProfileId: 3, status: undefined, visibleProfileId: 30 });
    expect(mocks.listDelaysForProfile).toHaveBeenCalledWith(3);
  });

  it("يحصر وحدات المنصة وإضافة البرمجيات في المالك", async () => {
    const owner = caller({ id: 1, role: "admin", email: OWNER_EMAIL });
    await expect(owner.modules.list()).resolves.toEqual([{ id: 7, moduleKey: "future-module", label: "وحدة مستقبلية" }]);
    await expect(owner.modules.create({ moduleKey: "future-module-2", label: "وحدة", path: "/future", iconKey: "Boxes", moduleType: "software", audience: ["full_control"], sortOrder: 1 })).resolves.toEqual({ id: 8 });
    await expect(caller({ id: 13, role: "user", email: "employee@court.example" }).modules.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يمرر فلتر القسم من المالك إلى قوائم المهام والموظفين", async () => {
    const owner = caller({ id: 1, role: "admin", email: OWNER_EMAIL });
    await owner.people.list({ unitId: 5 });
    expect(mocks.listProfilesForUnits).toHaveBeenCalledWith([5], undefined);
    await owner.tasks.list({ unitId: 5 });
    expect(mocks.listTasksForUnits).toHaveBeenCalledWith([5], undefined, 9, undefined, undefined);
  });
});
