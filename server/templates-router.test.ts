import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ templateUnitId: 3 as number | null }));
const mocks = vi.hoisted(() => ({ setDepartmentTaskTemplateAssignee: vi.fn(async () => ({ success: true as const })) }));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: vi.fn(async () => "employee"),
    getEffectiveRoles: vi.fn(async () => ["department_manager"]),
    getActiveCourtRoleAssignments: vi.fn(async () => [{ role: "department_manager", unitId: 3 }]),
    getTaskTemplateUnitId: vi.fn(async () => state.templateUnitId),
    setDepartmentTaskTemplateAssignee: mocks.setDepartmentTaskTemplateAssignee,
  };
});

import { courtRouter } from "./routers/court";

const caller = () => courtRouter.createCaller({ user: { id: 7, role: "user", email: "manager@court.example", name: "مدير", openId: "manager" } } as never);

describe("court.templates.setAssignee", () => {
  beforeEach(() => { vi.clearAllMocks(); state.templateUnitId = 3; });

  it("يسمح للمدير بإعادة إسناد قالب داخل وحدته", async () => {
    await expect(caller().templates.setAssignee({ templateId: 31, assigneeProfileId: 5 })).resolves.toEqual({ success: true });
    expect(mocks.setDepartmentTaskTemplateAssignee).toHaveBeenCalledWith({ templateId: 31, assigneeProfileId: 5, actorUserId: 7 });
  });

  it("يرفض إعادة إسناد قالب خارج وحدة المدير", async () => {
    state.templateUnitId = 2;
    await expect(caller().templates.setAssignee({ templateId: 31, assigneeProfileId: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.setDepartmentTaskTemplateAssignee).not.toHaveBeenCalled();
  });
});
