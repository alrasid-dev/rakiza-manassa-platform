import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}));

function selectChain(rows: Record<string, unknown>[] = [{ status: "active" }]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.groupBy = () => chain;
  chain.limit = async () => rows;
  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject);
  return chain;
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: vi.fn(() => selectChain([{ status: "active" }])),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        state.inserts.push(values);
        return [{ insertId: state.inserts.length }];
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => { state.updates.push(values); }),
      })),
    })),
  })),
}));

import { acknowledgeTask, createTask, submitTaskForReview } from "./court-service";

describe("مسار إسناد المهمة ثم تقديمها للمراجعة", () => {
  beforeEach(() => { state.inserts.length = 0; state.updates.length = 0; });

  it("يستلم المهمة ويضعها قيد التنفيذ قبل طلب اعتماد المدير", async () => {
    const result = await acknowledgeTask({ taskId: 55, actorUserId: 10 });
    expect(result).toEqual({ success: true, status: "in_progress", earlyStartRewarded: false });
    expect(state.updates).toEqual([expect.objectContaining({ status: "in_progress", startedAt: expect.any(Date), completedAt: null })]);
    expect(state.inserts).toEqual(expect.arrayContaining([expect.objectContaining({ taskId: 55, actorUserId: 10, updateType: "progress" })]));
  });

  it("ينشئ إشعار الإسناد ثم ينقل المهمة للمراجعة مع سجل تحديث وطلب اعتماد وأثر تدقيق", async () => {
    const taskId = await createTask({
      title: "مراجعة معاملة قضائية",
      priority: "high",
      assigneeProfileId: 10,
      scheduledFor: new Date("2026-08-14T07:00:00.000Z"),
      dueAt: new Date("2026-08-14T13:00:00.000Z"),
      assignedByUserId: 1,
    });
    const approvalId = await submitTaskForReview(taskId, 10, "اكتملت المعالجة الأولية");

    expect(state.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({ profileId: 10, category: "task_due", dedupeKey: `direct-task-assigned-${taskId}` }),
      expect.objectContaining({ taskId, actorUserId: 10, updateType: "submitted", note: "اكتملت المعالجة الأولية" }),
      expect.objectContaining({ entityType: "task", entityId: taskId, requestedByUserId: 10, currentRole: "trainee_affairs_manager" }),
      expect.objectContaining({ action: "task.created", entityType: "task", entityId: taskId }),
      expect.objectContaining({ action: "task.submitted_for_review", entityType: "task", entityId: taskId, metadata: JSON.stringify({ approvalId }) }),
    ]));
    expect(state.updates).toEqual([
      expect.objectContaining({ status: "under_review", completionNote: "اكتملت المعالجة الأولية", completedAt: expect.any(Date) }),
      expect.objectContaining({ isRead: true }),
    ]);
    expect(approvalId).toBeGreaterThan(0);
  });
});
