import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendPushForNotification: vi.fn(async () => ({ sent: 0, removed: 0, skipped: true })),
}));

vi.mock("./push-service", () => ({
  sendPushForNotification: mocks.sendPushForNotification,
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "./db";
import { bulkReviewDisciplinary, decideDisciplinaryCase } from "./court-service";
import { accessGrants, approvalRequests, personProfiles, tasks, users } from "../drizzle/schema";

function makeDb(resolve: (table: unknown) => unknown[]) {
  const insertResult = {
    then: (onfulfilled: (v: unknown) => unknown) => onfulfilled([{ insertId: 1 }]),
    onDuplicateKeyUpdate: () => insertResult,
  };
  return {
    select: () => ({ from: (t: unknown) => ({ where: () => ({ limit: async () => resolve(t) }) }) }),
    update: () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) }),
    insert: () => ({ values: () => insertResult }),
  };
}

function caseRow(status: string, overrides: Partial<{ entityType: string; entityId: number; currentRole: string; requestNote: string | null }> = {}) {
  return {
    id: 1,
    entityType: overrides.entityType ?? "disciplinary_action",
    entityId: overrides.entityId ?? 5,
    status,
    currentRole: overrides.currentRole ?? "department_manager",
    requestNote: overrides.requestNote ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendPushForNotification.mockResolvedValue({ sent: 0, removed: 0, skipped: true });
});

describe("decideDisciplinaryCase — سياسة اعتماد المساءلات", () => {
  it("المالك يعتمد مساءلة pending بدون انتظار رد الموظف", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb((table) => {
      if (table === approvalRequests) return [caseRow("pending")];
      if (table === users) return [{ role: "admin", email: "owner@court.example" }];
      if (table === accessGrants) return [{ permission: "full_control" }];
      return [];
    }));

    await expect(decideDisciplinaryCase({
      caseId: 1, decision: "save", note: "اعتماد", actorUserId: 1, managedUnitIds: null,
    })).resolves.toEqual({ ok: true });
  });

  it("المالك يعتمد مساءلة escalated (بعد التصعيد)", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb((table) => {
      if (table === approvalRequests) return [caseRow("escalated", { currentRole: "court_secretary" })];
      if (table === users) return [{ role: "user", email: "owner@court.example" }];
      if (table === accessGrants) return [{ permission: "full_control" }];
      return [];
    }));

    await expect(decideDisciplinaryCase({
      caseId: 1, decision: "save", note: "اعتماد", actorUserId: 2, managedUnitIds: null,
    })).resolves.toEqual({ ok: true });
  });

  it("مدير غير مالك لا يستطيع اعتماد مساءلة pending", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb((table) => {
      if (table === approvalRequests) return [caseRow("pending")];
      if (table === users) return [{ role: "user", email: "manager@court.example" }];
      if (table === accessGrants) return [{ permission: "employee" }];
      return [];
    }));

    await expect(decideDisciplinaryCase({
      caseId: 1, decision: "save", note: "اعتماد", actorUserId: 9, managedUnitIds: [1],
    })).rejects.toThrow("لم يرد الموظف بعد.");
  });

  it("مدير غير مالك لا يستطيع اعتماد مساءلة خارج وحدته", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb((table) => {
      if (table === approvalRequests) return [caseRow("under_review")];
      if (table === users) return [{ role: "user", email: "manager@court.example" }];
      if (table === accessGrants) return [{ permission: "employee" }];
      if (table === personProfiles) return [{ unitId: 99 }];
      return [];
    }));

    await expect(decideDisciplinaryCase({
      caseId: 1, decision: "save", note: "اعتماد", actorUserId: 9, managedUnitIds: [1],
    })).rejects.toThrow("خارج نطاق وحدتك.");
  });

  it("لا يمكن اعتماد مساءلة حالتها approved (نهائية) حتى للمالك", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb((table) => {
      if (table === approvalRequests) return [caseRow("approved")];
      if (table === users) return [{ role: "admin", email: "owner@court.example" }];
      if (table === accessGrants) return [{ permission: "full_control" }];
      return [];
    }));

    await expect(decideDisciplinaryCase({
      caseId: 1, decision: "save", note: "اعتماد", actorUserId: 1, managedUnitIds: null,
    })).rejects.toThrow("تم البت في هذه المساءلة مسبقاً.");
  });
});

function extractCaseId(cond: unknown): number | null {
  const c = cond as { queryChunks?: Array<unknown> };
  if (!c?.queryChunks) return null;
  for (const chunk of c.queryChunks) {
    if (typeof chunk === "number") return chunk;
    if (chunk && typeof chunk === "object") {
      const v = (chunk as { value?: unknown }).value;
      if (typeof v === "number") return v;
    }
  }
  return null;
}

function makeDbWithWhere(resolve: (table: unknown, caseId: number | null) => unknown[]) {
  const insertResult = {
    then: (onfulfilled: (v: unknown) => unknown) => onfulfilled([{ insertId: 1 }]),
    onDuplicateKeyUpdate: () => insertResult,
  };
  return {
    select: () => ({ from: (t: unknown) => ({ where: (cond: unknown) => ({ limit: async () => resolve(t, extractCaseId(cond)) }) }) }),
    update: () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) }),
    insert: () => ({ values: () => insertResult }),
  };
}

describe("bulkReviewDisciplinary + fire-and-forget", () => {
  it("decideDisciplinaryCase completes without waiting for notifications", async () => {
    mocks.sendPushForNotification.mockRejectedValue(new Error("push failed"));
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb((table) => {
      if (table === approvalRequests) return [caseRow("under_review")];
      if (table === users) return [{ role: "admin", email: "owner@court.example" }];
      if (table === accessGrants) return [{ permission: "full_control" }];
      return [];
    }));

    await expect(decideDisciplinaryCase({
      caseId: 1, decision: "save", note: "اعتماد", actorUserId: 1, managedUnitIds: null,
    })).resolves.toEqual({ ok: true });
  });

  it("bulkReviewDisciplinary completes for 10 cases", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb((table) => {
      if (table === approvalRequests) return [caseRow("under_review")];
      if (table === users) return [{ role: "admin", email: "owner@court.example" }];
      if (table === accessGrants) return [{ permission: "full_control" }];
      return [];
    }));

    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    await expect(bulkReviewDisciplinary({ caseIds: ids, decision: "save", note: "اعتماد", actorUserId: 1, managedUnitIds: null })).resolves.toEqual({ processed: 10, failed: 0 });
  });

  it("one failing case does not break the whole bulk operation", async () => {
    const rows = new Map<number, ReturnType<typeof caseRow>>();
    for (let i = 1; i <= 5; i += 1) rows.set(i, caseRow("under_review", { entityId: i }));
    rows.set(3, caseRow("under_review", { entityType: "wrong", entityId: 3 })); // هذا السجل سيفشل

    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDbWithWhere((table, caseId) => {
      if (table === approvalRequests) {
        if (caseId != null && rows.has(caseId)) return [rows.get(caseId)!];
        return [caseRow("under_review")];
      }
      if (table === users) return [{ role: "admin", email: "owner@court.example" }];
      if (table === accessGrants) return [{ permission: "full_control" }];
      return [];
    }));

    await expect(bulkReviewDisciplinary({ caseIds: [1, 2, 3, 4, 5], decision: "save", note: "اعتماد", actorUserId: 1, managedUnitIds: null })).resolves.toEqual({ processed: 4, failed: 1 });
  });
});
