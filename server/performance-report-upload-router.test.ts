import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roles: ["performance_monitor"] as string[],
  permission: "employee" as string,
  createOperationalReport: vi.fn(async () => ({ documentId: 21, taskId: 22, summary: "ملخص", distribution: { candidateCount: 2, createdTasks: 2, unassignedTasks: 0, availableStaffCount: 2, excludedOnLeaveCount: 1 } })),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getAccessPermission: vi.fn(async () => mocks.permission),
    getEffectiveRoles: vi.fn(async () => mocks.roles),
    getActiveCourtRoleAssignments: vi.fn(async () => []),
    getProfileForUser: vi.fn(async () => ({ id: 9, fullName: "مراقب الأداء", unitId: 90023, personType: "administrative" })),
    createOperationalReport: mocks.createOperationalReport,
  };
});

import { courtRouter } from "./routers/court";

const caller = () => courtRouter.createCaller({ user: { id: 7, role: "user", email: "monitor@court.example", name: "مراقب الأداء", openId: "monitor" } } as never);
const input = { title: "تقرير متابعة أسبوعي", originalName: "performance-report.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const, contentBase64: "QUFBQUFBQUFBQUFBQUFBQQ==", unitId: 90028, createTasksForTargetUnit: true };

describe("court.reports.upload لمراقبة الأداء", () => {
  it("يمرر إنشاء المهام الموزعة للقسم الذي يختاره مراقب الأداء", async () => {
    mocks.roles = ["performance_monitor"];
    await expect(caller().reports.upload(input)).resolves.toMatchObject({ distribution: { createdTasks: 2 } });
    expect(mocks.createOperationalReport).toHaveBeenCalledWith(expect.objectContaining({ profileId: 9, unitId: 90028, createTasksForTargetUnit: true, actorUserId: 7 }));
  });

  it("يرفض تحويل التقرير إلى مهام موزعة عن غير مراقب الأداء", async () => {
    mocks.roles = [];
    await expect(caller().reports.upload(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يقبل حزمة ZIP للتخزين والمراجعة من دون تحويلها إلى مهام", async () => {
    mocks.roles = ["performance_monitor"];
    await expect(caller().reports.upload({ ...input, originalName: "مرفقات-الأسبوع.zip", mimeType: "application/zip", createTasksForTargetUnit: false })).resolves.toMatchObject({ documentId: 21 });
    expect(mocks.createOperationalReport).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "application/zip", createTasksForTargetUnit: false }));
  });

  it("يسمح للمالك (full_control) برفع تقرير لأي قسم خارج وحدته", async () => {
    mocks.permission = "full_control";
    mocks.roles = [];
    await expect(caller().reports.upload({ ...input, createTasksForTargetUnit: false })).resolves.toMatchObject({ documentId: 21 });
    expect(mocks.createOperationalReport).toHaveBeenCalledWith(expect.objectContaining({ profileId: 9, unitId: 90028, actorUserId: 7 }));
  });
});
