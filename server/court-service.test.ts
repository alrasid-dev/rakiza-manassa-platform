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
import { decideDisciplinaryCase } from "./court-service";
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
