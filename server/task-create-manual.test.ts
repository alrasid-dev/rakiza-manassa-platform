import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  selectQueue: [] as Record<string, unknown>[][],
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.selectQueue.shift() ?? [] }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => { state.updates.push(values); return { where: async () => ({ affectedRows: 1 }) }; } }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const recordOnce = () => { state.inserts.push(values); return [{ insertId: state.inserts.length }]; };
        return { then: (f: (v: unknown) => unknown) => f(recordOnce()), onDuplicateKeyUpdate: () => ({ then: (f: (v: unknown) => unknown) => f(recordOnce()) }) };
      },
    }),
  })),
}));

import { createManualTask } from "./court-service";

function queue(...rows: Record<string, unknown>[][]) {
  state.selectQueue.push(...rows);
}

const input = { title: "مهمة يدوية", description: "وصف", assigneeProfileId: 30, scheduledFor: new Date("2026-10-08T05:00:00Z"), actorUserId: 1 };

describe("createManualTask — إضافة مهمة يدوية", () => {
  beforeEach(() => { state.inserts.length = 0; state.updates.length = 0; state.selectQueue.length = 0; });

  it("يرفض الإسناد الفوري لموظفة في إجازة بدون تاريخ بدء", async () => {
    queue([{ id: 30, status: "on_leave", unitId: 5 }]);
    await expect(createManualTask(input)).rejects.toThrow();
  });

  it("يقبل الإسناد لموظفة في إجازة مع تاريخ بدء مستقبلي", async () => {
    // getProfileById → الموظفة، ثم createTask: قراءة حالة الموظفة → نشط افتراضياً
    queue([{ id: 30, status: "on_leave", unitId: 5 }], [{ id: 30, status: "on_leave", unitId: 5 }]);
    await createManualTask({ ...input, startDate: "2026-10-25" });
    // يجب أن يصل إلى إنشاء المهمة (insert) دون رمي خطأ الإجازة
    expect(state.inserts.length).toBeGreaterThan(0);
  });

  it("يرفض الإسناد لموظفة غير نشطة", async () => {
    queue([{ id: 30, status: "inactive", unitId: 5 }]);
    await expect(createManualTask(input)).rejects.toThrow();
  });
});
