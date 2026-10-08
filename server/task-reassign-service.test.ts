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

import { reassignTaskManual } from "./court-service";

function queue(...rows: Record<string, unknown>[][]) {
  state.selectQueue.push(...rows);
}

const taskRow = { id: 100, title: "مهمة اختبار", status: "new", assigneeProfileId: 20, unitId: 5, scheduledFor: new Date("2026-10-08T04:00:00Z"), completedAt: null };
const newAssigneeRow = { id: 30, fullName: "موظفة جديدة", unitId: 5, status: "active" };
const oldAssigneeRow = { fullName: "موظفة قديمة" };
const noActiveIdentity = { activeDepartmentAccountId: null };

const input = { taskId: 100, newAssigneeProfileId: 30, reason: "نقل المهمة بسبب عبء العمل", actorUserId: 1 };

describe("reassignTaskManual — إعادة الإسناد اليدوي", () => {
  beforeEach(() => { state.inserts.length = 0; state.updates.length = 0; state.selectQueue.length = 0; });

  it("manager can reassign task manually (success)", async () => {
    queue([taskRow], [newAssigneeRow], [oldAssigneeRow], [], [noActiveIdentity]);
    const r = await reassignTaskManual(input);
    expect(r.success).toBe(true);
    expect(r.newAssigneeName).toBe("موظفة جديدة");
  });

  it("cannot reassign completed task", async () => {
    queue([{ ...taskRow, status: "completed" }]);
    await expect(reassignTaskManual(input)).rejects.toThrow();
  });

  it("cannot reassign to same assignee", async () => {
    queue([{ ...taskRow, assigneeProfileId: 30 }]);
    await expect(reassignTaskManual(input)).rejects.toThrow();
  });

  it("reassign requires reason (min 10)", async () => {
    queue([taskRow]);
    await expect(reassignTaskManual({ ...input, reason: "قصير" })).rejects.toThrow();
  });

  it("assignee must be active", async () => {
    queue([taskRow], []);
    await expect(reassignTaskManual(input)).rejects.toThrow();
  });

  it("assignee must be same unit", async () => {
    queue([taskRow], [{ id: 30, fullName: "موظفة", unitId: 9, status: "active" }]);
    await expect(reassignTaskManual(input)).rejects.toThrow();
  });

  it("reassign logs in audit", async () => {
    queue([taskRow], [newAssigneeRow], [oldAssigneeRow], [], [noActiveIdentity]);
    await reassignTaskManual(input);
    expect(state.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "task.reassigned_manual", entityType: "task", entityId: 100 }),
    ]));
  });

  it("reassign notifies both employees", async () => {
    queue([taskRow], [newAssigneeRow], [oldAssigneeRow], [], [noActiveIdentity]);
    await reassignTaskManual(input);
    expect(state.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({ profileId: 30, title: "مهمة مسندة إليك" }),
      expect.objectContaining({ profileId: 20, title: "سُحبت منك مهمة" }),
    ]));
  });

  it("sets reassignedFromProfileId and reassignmentReason=manual", async () => {
    queue([taskRow], [newAssigneeRow], [oldAssigneeRow], [], [noActiveIdentity]);
    await reassignTaskManual(input);
    expect(state.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ assigneeProfileId: 30, reassignedFromProfileId: 20, reassignmentReason: "manual", status: "new" }),
    ]));
  });
});
