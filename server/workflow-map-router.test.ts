import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeWorkflowDocument: vi.fn(async () => ({
    map: { title: "إجراءات معالجة الطلبات", summary: "ملخص", steps: [{ order: 1, title: "استلام الطلب", description: "", ownerUnitHint: "قسم القيود", deliverable: "", slaDays: 3, dependsOnOrder: null }] },
    diagram: { width: 300, height: 200, nodeWidth: 220, nodeHeight: 88, lanes: 1, nodes: [], edges: [] },
    extractedText: "١- استلام الطلب",
    method: "text" as const,
    model: null,
    documentName: "خطة.txt",
  })),
  listWorkflowStaff: vi.fn(async () => [{ id: 5, fullName: "سعد المطيري", unitId: 3, unitName: "قسم القيود", openWorkload: 1 }]),
  distributeWorkflowSteps: vi.fn(async (input: { mode: string; sourceName: string }) => ({ createdTaskIds: [71], created: [{ order: 1, taskId: 71, assigneeProfileId: 5, title: "استلام الطلب" }], assignments: [{ order: 1, assigneeProfileId: 5, matchReason: "balanced" }], mode: input.mode, sourceName: input.sourceName })),
  getEffectiveRoles: vi.fn(async (userId: number) => (userId === 12 ? ["department_manager"] : [])),
  getAccessPermission: vi.fn(async (email: string | null) => (email?.includes("manager") ? "general_view" : "employee")),
  getActiveCourtRoleAssignments: vi.fn(async (userId: number) => (userId === 12 ? [{ role: "department_manager", unitId: 3, isActive: true }] : [])),
  listOrganizationUnits: vi.fn(async () => [{ id: 2, name: "قسم الملازمين" }, { id: 3, name: "قسم القيود" }]),
}));

vi.mock("./workflow-map-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./workflow-map-service")>();
  return { ...actual, analyzeWorkflowDocument: mocks.analyzeWorkflowDocument, listWorkflowStaff: mocks.listWorkflowStaff, distributeWorkflowSteps: mocks.distributeWorkflowSteps };
});

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getEffectiveRoles: mocks.getEffectiveRoles,
    getAccessPermission: mocks.getAccessPermission,
    getActiveCourtRoleAssignments: mocks.getActiveCourtRoleAssignments,
    listOrganizationUnits: mocks.listOrganizationUnits,
  };
});

import { courtRouter } from "./routers/court";

const callerFor = (user: { id: number; role: "user" | "admin"; email: string | null }) => courtRouter.createCaller({ user: { ...user, name: "مستخدم اختبار", openId: `u-${user.id}` } } as never);
const leadershipCaller = () => callerFor({ id: 9, role: "admin", email: "owner@court.example" });
const managerCaller = () => callerFor({ id: 12, role: "user", email: "manager@court.example" });
const employeeCaller = () => callerFor({ id: 77, role: "user", email: "employee@court.example" });

const documentInput = { originalName: "خطة.txt", mimeType: "text/plain", contentBase64: Buffer.from("١- استلام الطلب", "utf8").toString("base64") };
const stepsInput = { sourceName: "خطة.txt", title: "إجراءات معالجة الطلبات", mode: "auto" as const, unitId: 3, steps: [{ order: 1, title: "استلام الطلب وتسجيله", slaDays: 3 }] };

describe("مسار مخطط سير العمل", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("يحلل المستند للقيادة ويعيد الخطوات والمخطط", async () => {
    const result = await leadershipCaller().workflowMap.analyze(documentInput);
    expect(mocks.analyzeWorkflowDocument).toHaveBeenCalledWith({ userId: 9, originalName: "خطة.txt", mimeType: "text/plain", contentBase64: documentInput.contentBase64 });
    expect(result.map.steps[0]!.title).toBe("استلام الطلب");
    expect(result.diagram.lanes).toBe(1);
  });

  it("يقصر موظفي الإسناد على وحدات مدير القسم ويمنع الموظف العادي", async () => {
    await expect(managerCaller().workflowMap.staff()).resolves.toEqual([{ id: 5, fullName: "سعد المطيري", unitId: 3, unitName: "قسم القيود", openWorkload: 1 }]);
    expect(mocks.listWorkflowStaff).toHaveBeenCalledWith({ unitIds: [3] });
    expect(mocks.listOrganizationUnits).not.toHaveBeenCalled();
    await expect(leadershipCaller().workflowMap.staff()).resolves.toEqual([{ id: 5, fullName: "سعد المطيري", unitId: 3, unitName: "قسم القيود", openWorkload: 1 }]);
    expect(mocks.listWorkflowStaff).toHaveBeenLastCalledWith({ unitIds: [2, 3] });
    await expect(employeeCaller().workflowMap.staff()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employeeCaller().workflowMap.analyze(documentInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employeeCaller().workflowMap.distribute(stepsInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.analyzeWorkflowDocument).not.toHaveBeenCalled();
    expect(mocks.distributeWorkflowSteps).not.toHaveBeenCalled();
  });

  it("يوزع الخطوات داخل نطاق الوحدة ويرفض النطاق الخارجي", async () => {
    const result = await managerCaller().workflowMap.distribute(stepsInput);
    expect(mocks.distributeWorkflowSteps).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 12, unitIds: [3], unitId: 3, mode: "auto", sourceName: "خطة.txt" }));
    expect(result.createdTaskIds).toEqual([71]);
    expect(result.mode).toBe("auto");
    await expect(managerCaller().workflowMap.distribute({ ...stepsInput, unitId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(leadershipCaller().workflowMap.distribute({ ...stepsInput, mode: "manual", steps: [{ order: 1, title: "استلام الطلب وتسجيله", assigneeProfileId: 5, priority: "high" as const }] })).resolves.toMatchObject({ mode: "manual" });
    expect(mocks.distributeWorkflowSteps).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "manual", unitIds: [2, 3], steps: [expect.objectContaining({ assigneeProfileId: 5, priority: "high", dueAt: null })] }));
  });
});
