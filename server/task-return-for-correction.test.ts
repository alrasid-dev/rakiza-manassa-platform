import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  selectQueue: [] as Record<string, unknown>[][],
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.selectQueue.shift() ?? [],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        return { where: async () => ({ affectedRows: 1 }) };
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const recordOnce = () => {
          state.inserts.push(values);
          return [{ insertId: state.inserts.length }];
        };
        return {
          then: (onfulfilled: (v: unknown) => unknown) => onfulfilled(recordOnce()),
          onDuplicateKeyUpdate: () => ({
            then: (onfulfilled: (v: unknown) => unknown) => onfulfilled(recordOnce()),
          }),
        };
      },
    }),
  })),
}));

vi.mock("./push-service", () => ({
  sendPushForNotification: vi.fn(async () => ({ sent: 0, removed: 0, skipped: true })),
}));

import { reviewTaskApproval } from "./court-service";

function queue(...rows: Record<string, unknown>[][]) {
  state.selectQueue.push(...rows);
}

const approvalRow = { id: 1, status: "pending", taskId: 100, submittedByProfileId: 20 };
const taskRow = { id: 100, assigneeProfileId: 20, title: "مهمة قيد الاعتماد", status: "under_review", completedAt: null };
const noActiveIdentity = { activeDepartmentAccountId: null };

const returnedInput = {
  approvalId: 1,
  decision: "returned" as const,
  note: "يرجى تصحيح الأخطاء في التقرير المرفوع",
  reviewerProfileId: 10,
  reviewerUserId: 1,
};

describe("reviewTaskApproval — عودة للتصحيح (returned)", () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.updates.length = 0;
    state.selectQueue.length = 0;
  });

  it("task can be returned for correction", async () => {
    queue([approvalRow], [taskRow], [], [noActiveIdentity]);

    const result = await reviewTaskApproval(returnedInput);

    expect(result.success).toBe(true);
    expect(result.pointsAwarded).toBe(0);
  });

  it("returned task status = in_progress", async () => {
    queue([approvalRow], [taskRow], [], [noActiveIdentity]);

    await reviewTaskApproval(returnedInput);

    expect(state.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "in_progress", completedAt: null }),
    ]));
  });

  it("return reason logged in task_updates", async () => {
    queue([approvalRow], [taskRow], [], [noActiveIdentity]);

    await reviewTaskApproval(returnedInput);

    expect(state.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({ updateType: "returned", note: expect.stringContaining("أُعيدت المهمة للتصحيح") }),
    ]));
  });

  it("return reason required (min 10)", async () => {
    queue([approvalRow], [taskRow]);

    await expect(reviewTaskApproval({ ...returnedInput, note: "قصير" })).rejects.toThrow();
  });
});
