import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { attendanceRecords, leaveRequests, taskAttachments, tasks } from "../drizzle/schema";
import { verifyTaskForApproval } from "./court-service";

function makeVerifyDb(taskRow: unknown | undefined, attachments: unknown[], attendance: unknown[], leaves: unknown[]) {
  const byTable = new Map<unknown, unknown[]>();
  byTable.set(tasks, taskRow ? [taskRow] : []);
  byTable.set(taskAttachments, attachments);
  byTable.set(attendanceRecords, attendance);
  byTable.set(leaveRequests, leaves);
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => Promise.resolve(byTable.get(table) ?? []),
        }),
      }),
    }),
  };
}

describe("verifyTaskForApproval", () => {
  beforeEach(() => vi.clearAllMocks());

  it("يرمي خطأ عند عدم توفر قاعدة البيانات", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(verifyTaskForApproval(1)).rejects.toMatchObject({ message: "قاعدة البيانات غير متاحة" });
  });

  it("يرمي خطأ عند غياب المهمة", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeVerifyDb(undefined, [], [], []));
    await expect(verifyTaskForApproval(1)).rejects.toMatchObject({ message: "المهمة المطلوبة غير موجودة." });
  });

  it("يجتاز كل الفحوصات عندما تكون المهمة مكتملة المستلزمات", async () => {
    const taskRow = { id: 1, status: "under_review", assigneeProfileId: 10, completedAt: new Date("2026-10-07T10:00:00Z") };
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeVerifyDb(taskRow, [{ id: 1 }], [{ checkInAt: new Date() }], []));
    const result = await verifyTaskForApproval(1);
    expect(result.allPassed).toBe(true);
    expect(result.checks.every(c => c.passed)).toBe(true);
  });

  it("يفشل الفحص عندما تكون الحالة ليست قيد المراجعة", async () => {
    const taskRow = { id: 2, status: "in_progress", assigneeProfileId: 10, completedAt: new Date("2026-10-07T10:00:00Z") };
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeVerifyDb(taskRow, [{ id: 1 }], [{ checkInAt: new Date() }], []));
    const result = await verifyTaskForApproval(2);
    expect(result.allPassed).toBe(false);
    const statusCheck = result.checks.find(c => c.key === "under_review");
    expect(statusCheck?.passed).toBe(false);
  });
});
