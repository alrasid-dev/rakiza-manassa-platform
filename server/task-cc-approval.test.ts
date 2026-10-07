import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
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
    update: () => ({ set: () => ({ where: async () => ({ affectedRows: 1 }) }) }),
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

import { reviewTaskApproval } from "./court-service";

function queue(...rows: Record<string, unknown>[][]) {
  state.selectQueue.push(...rows);
}

const approvalRow = { id: 1, status: "pending", taskId: 100, submittedByProfileId: 20 };
const taskRow = { id: 100, assigneeProfileId: 20, title: "مهمة قيد الاعتماد", status: "under_review", completedAt: null };
const noActiveIdentity = { activeDepartmentAccountId: null };

const approveInput = {
  approvalId: 1,
  decision: "approved" as const,
  note: "تم الاعتماد",
  reviewerProfileId: 10,
  reviewerUserId: 1,
};

describe("reviewTaskApproval — ربط الاعتماد بنسخة للاطلاع (CC)", () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.selectQueue.length = 0;
  });

  it("approval adds viewers to task_cc", async () => {
    queue(
      [approvalRow],       // 1) approval
      [taskRow],           // 2) task
      [],                  // 3) scoreEvents (لا نقاط سابقة)
      [{ unitId: 5 }],     // 4) ملف المدير
      [{ unitId: 5 }],     // 5) ملف المطّلع (نفس القسم)
      [],                  // 6) actorProfile (logAudit)
      [noActiveIdentity],  // 7) users (logAudit)
    );

    const result = await reviewTaskApproval({ ...approveInput, viewerProfileIds: [30] });

    expect(result.success).toBe(true);
    expect(state.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 100, viewerProfileId: 30, addedByProfileId: 10 }),
    ]));
  });

  it("viewer outside manager unit is skipped", async () => {
    queue(
      [approvalRow],
      [taskRow],
      [],
      [{ unitId: 5 }],     // المدير قسم 5
      [{ unitId: 9 }],     // المطّلع قسم 9 (خارج القسم)
      [],
      [noActiveIdentity],
    );

    await reviewTaskApproval({ ...approveInput, viewerProfileIds: [30] });

    const ccInserts = state.inserts.filter(item => (item as { viewerProfileId?: number }).viewerProfileId === 30);
    expect(ccInserts).toHaveLength(0);
  });

  it("assignee cannot be added as viewer", async () => {
    queue(
      [approvalRow],
      [taskRow],           // assigneeProfileId = 20
      [],
      [{ unitId: 5 }],     // ملف المدير (يُستدعى قبل التصفية)
      [],
      [noActiveIdentity],
    );

    await reviewTaskApproval({ ...approveInput, viewerProfileIds: [20] });

    const ccInserts = state.inserts.filter(item => (item as { viewerProfileId?: number }).viewerProfileId === 20);
    expect(ccInserts).toHaveLength(0);
  });

  it("duplicate viewer is deduped", async () => {
    queue(
      [approvalRow],
      [taskRow],
      [],
      [{ unitId: 5 }],
      [{ unitId: 5 }],     // تحديد واحد فقط بعد إزالة التكرار
      [],
      [noActiveIdentity],
    );

    await reviewTaskApproval({ ...approveInput, viewerProfileIds: [30, 30] });

    const ccInserts = state.inserts.filter(item => (item as { viewerProfileId?: number }).viewerProfileId === 30);
    expect(ccInserts).toHaveLength(1);
  });

  it("notification sent to each viewer", async () => {
    queue(
      [approvalRow],
      [taskRow],
      [],
      [{ unitId: 5 }],
      [{ unitId: 5 }],
      [],
      [noActiveIdentity],
    );

    await reviewTaskApproval({ ...approveInput, viewerProfileIds: [30] });

    expect(state.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({ profileId: 30, category: "task_due", title: "نسخة للاطلاع", dedupeKey: "task-cc-100-30" }),
    ]));
  });

  it("approval works when viewerProfileIds is empty/undefined", async () => {
    queue(
      [approvalRow],
      [taskRow],
      [],
      [],                  // actorProfile
      [noActiveIdentity],
    );

    const result = await reviewTaskApproval({ ...approveInput });

    expect(result.success).toBe(true);
    const ccInserts = state.inserts.filter(item => (item as { viewerProfileId?: number }).viewerProfileId !== undefined);
    expect(ccInserts).toHaveLength(0);
  });
});
