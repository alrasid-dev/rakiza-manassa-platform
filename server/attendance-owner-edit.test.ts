import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  updates: [] as Array<Record<string, unknown>>,
  deletes: [] as Array<Record<string, unknown>>,
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { ownerDeleteAttendanceRecord, ownerEditAttendanceCheckIn } from "./court-service";

const existingRecord = {
  id: 21,
  profileId: 9,
  recordDate: new Date("2026-08-14T00:00:00Z"),
  checkInAt: new Date("2026-08-14T04:00:00Z"),
  checkOutAt: new Date("2026-08-14T11:15:00Z"),
  status: "present",
  positiveMinutes: 0,
  negativeMinutes: 0,
  penaltyMinutes: 0,
};

function createFakeDb() {
  let selectCount = 0;
  const makeChain = (): any => {
    selectCount += 1;
    const isFirst = selectCount === 1;
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => (isFirst ? [existingRecord] : []),
      then: (resolve: (v: any) => any) => resolve([]),
    };
    return chain;
  };
  return {
    select: () => makeChain(),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { mocks.updates.push(values); } }) }),
    insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => { mocks.inserts.push({ table, values }); return { onDuplicateKeyUpdate: async () => undefined }; } }),
    delete: () => ({ where: async () => { mocks.deletes.push({}); } }),
  };
}

describe("تعديل الحضور بواسطة المالك (الخدمة)", () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.updates.length = 0;
    mocks.deletes.length = 0;
    mocks.getDb.mockResolvedValue(createFakeDb());
  });

  it("edit logs in audit_logs with old/new values and reason", async () => {
    await expect(ownerEditAttendanceCheckIn({
      profileId: 9,
      recordDate: new Date("2026-08-14T00:00:00Z"),
      checkInAt: new Date("2026-08-14T05:00:00Z"),
      actorUserId: 1,
      reason: "تصحيح وقت الحضور بناءً على طلب الموظف.",
    })).resolves.toEqual({ success: true, attendanceId: 21 });

    expect(mocks.updates[0]).toMatchObject({ checkInAt: new Date("2026-08-14T05:00:00Z") });

    const audit = mocks.inserts.find(entry => entry.values.action === "attendance.owner_edit");
    expect(audit).toBeTruthy();
    expect(audit?.values).toMatchObject({ actorUserId: 1, entityType: "attendance", entityId: 21 });
    expect(JSON.stringify(audit?.values.metadata)).toContain("تصحيح وقت الحضور بناءً على طلب الموظف.");
  });

  it("edit recalculates balance (monthly_balances upsert)", async () => {
    await ownerEditAttendanceCheckIn({
      profileId: 9,
      recordDate: new Date("2026-08-14T00:00:00Z"),
      checkInAt: new Date("2026-08-14T05:00:00Z"),
      actorUserId: 1,
      reason: "تصحيح وقت الحضور بناءً على طلب الموظف.",
    });

    const balanceInsert = mocks.inserts.find(entry => (entry.values as Record<string, unknown>).hijriMonthKey !== undefined);
    expect(balanceInsert).toBeTruthy();
  });

  it("delete logs in audit_logs with snapshot and reason", async () => {
    await expect(ownerDeleteAttendanceRecord({ recordId: 21, actorUserId: 1, reason: "حذف سجل مكرر بناءً على مراجعة الأمين." })).resolves.toEqual({ success: true });

    expect(mocks.deletes).toHaveLength(1);
    const audit = mocks.inserts.find(entry => entry.values.action === "attendance.owner_delete");
    expect(audit).toBeTruthy();
    expect(audit?.values).toMatchObject({ actorUserId: 1, entityType: "attendance", entityId: 21 });
    expect(JSON.stringify(audit?.values.metadata)).toContain("حذف سجل مكرر بناءً على مراجعة الأمين.");
  });
});
