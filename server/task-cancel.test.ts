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

import { cancelTask } from "./court-service";

function queue(...rows: Record<string, unknown>[][]) {
  state.selectQueue.push(...rows);
}

const taskRow = { id: 100, title: "مهمة اختبار", status: "new", assigneeProfileId: 20, unitId: 5, scheduledFor: new Date("2026-10-08T04:00:00Z"), completedAt: null };

describe("cancelTask — إلغاء المهمة", () => {
  beforeEach(() => { state.inserts.length = 0; state.updates.length = 0; state.selectQueue.length = 0; });

  it("يُرشف المهمة (archivedAt) ويُسجّل الإلغاء مع الإشعار", async () => {
    queue([taskRow], [taskRow]); // أول قراءة للتحقق + القراءة النهائية للإرجاع
    await cancelTask({ taskId: 100, actorUserId: 1, cancellationReason: "تم إلغاء المهمة لعدم الحاجة إليها" });

    const taskUpdate = state.updates.find(u => (u as Record<string, unknown>).status === "cancelled");
    expect(taskUpdate).toBeDefined();
    expect((taskUpdate as Record<string, unknown>).archivedAt).toBeDefined();
    expect((taskUpdate as Record<string, unknown>).archivedByUserId).toBe(1);

    const notif = state.inserts.find(i => (i as Record<string, unknown>).dedupeKey === "task-cancelled-100");
    expect(notif).toBeDefined();
    expect((notif as Record<string, unknown>).profileId).toBe(20);
    expect((notif as Record<string, unknown>).category).toBe("task_due");
  });

  it("يرفض الإلغاء بدون سبب", async () => {
    queue([taskRow]);
    await expect(cancelTask({ taskId: 100, actorUserId: 1, cancellationReason: "   " })).rejects.toThrow();
  });
});
