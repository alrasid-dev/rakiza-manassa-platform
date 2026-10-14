import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  updates: [] as Array<Record<string, unknown>>,
  deletes: [] as Array<Record<string, unknown>>,
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { ownerCreateAttendanceRecord, ownerDeleteAttendanceRecord, ownerUpdateAttendanceRecord } from "./court-service";

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

let firstSelectRows: Array<Record<string, unknown>> = [existingRecord as unknown as Record<string, unknown>];

function createFakeDb() {
  let selectCount = 0;
  const makeChain = (): any => {
    selectCount += 1;
    const isFirst = selectCount === 1;
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => (isFirst ? firstSelectRows : []),
      then: (resolve: (v: any) => any) => resolve([]),
    };
    return chain;
  };
  return {
    select: () => makeChain(),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { mocks.updates.push(values); } }) }),
    insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => { mocks.inserts.push({ table, values }); const result: any = [{ insertId: 123 }]; result.onDuplicateKeyUpdate = async () => undefined; return result; } }),
    delete: () => ({ where: async () => { mocks.deletes.push({}); } }),
  };
}

const REASON = "تصحيح سجل الحضور بناءً على مراجعة الأمين.";

describe("ownerUpdateAttendanceRecord — تعديل موحّد (null/undefined/Date)", () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.updates.length = 0;
    mocks.deletes.length = 0;
    firstSelectRows = [existingRecord as unknown as Record<string, unknown>];
    mocks.getDb.mockResolvedValue(createFakeDb());
  });

  it("يعدّل القيمتين ويضبط الحالة صراحةً (Date)", async () => {
    await ownerUpdateAttendanceRecord({
      profileId: 9,
      recordDate: new Date("2026-08-14T00:00:00Z"),
      checkInAt: new Date("2026-08-14T05:00:00Z"),
      checkOutAt: new Date("2026-08-14T12:00:00Z"),
      status: "present",
      actorUserId: 1,
      reason: REASON,
    });

    expect(mocks.updates[0]).toMatchObject({
      checkInAt: new Date("2026-08-14T05:00:00Z"),
      checkOutAt: new Date("2026-08-14T12:00:00Z"),
      status: "present",
    });
  });

  it("يمسح القيمة عند إرسال null (checkOutAt = null)", async () => {
    await ownerUpdateAttendanceRecord({
      profileId: 9,
      recordDate: new Date("2026-08-14T00:00:00Z"),
      checkOutAt: null,
      actorUserId: 1,
      reason: REASON,
    });

    expect(mocks.updates[0]).toMatchObject({ checkOutAt: null });
    // checkInAt بقي كما هو (undefined = احتفظ بالقديم)
    expect(mocks.updates[0]).toMatchObject({ checkInAt: existingRecord.checkInAt });
  });

  it("يحتفظ بالقيمة القديمة عند حذف الحقل (undefined)", async () => {
    await ownerUpdateAttendanceRecord({
      profileId: 9,
      recordDate: new Date("2026-08-14T00:00:00Z"),
      checkInAt: new Date("2026-08-14T05:00:00Z"),
      actorUserId: 1,
      reason: REASON,
    });

    expect(mocks.updates[0]).toMatchObject({
      checkInAt: new Date("2026-08-14T05:00:00Z"),
      checkOutAt: existingRecord.checkOutAt,
    });
  });

  it("يوثّق التعديل في audit_logs", async () => {
    await ownerUpdateAttendanceRecord({
      profileId: 9,
      recordDate: new Date("2026-08-14T00:00:00Z"),
      checkOutAt: new Date("2026-08-14T12:00:00Z"),
      actorUserId: 1,
      reason: REASON,
    });

    const audit = mocks.inserts.find(entry => entry.values.action === "attendance.owner_edit");
    expect(audit).toBeTruthy();
    expect(audit?.values).toMatchObject({ actorUserId: 1, entityType: "attendance", entityId: 21 });
  });
});

describe("ownerCreateAttendanceRecord — إضافة سجل", () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.updates.length = 0;
    mocks.deletes.length = 0;
    firstSelectRows = []; // لا يوجد سجل سابق → مسار الإدراج
    mocks.getDb.mockResolvedValue(createFakeDb());
  });

  it("ينشئ سجلاً جديداً بقيم صريحة", async () => {
    await ownerCreateAttendanceRecord({
      profileId: 9,
      recordDate: new Date("2026-08-14T00:00:00Z"),
      checkInAt: new Date("2026-08-14T04:00:00Z"),
      checkOutAt: new Date("2026-08-14T11:15:00Z"),
      status: "present",
      actorUserId: 1,
      reason: REASON,
    });

    const insert = mocks.inserts.find(entry => (entry.values as Record<string, unknown>).profileId === 9);
    expect(insert).toBeTruthy();
    expect(insert?.values).toMatchObject({ profileId: 9, status: "present" });
  });
});

describe("ownerDeleteAttendanceRecord — حذف سجل", () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.updates.length = 0;
    mocks.deletes.length = 0;
    firstSelectRows = [existingRecord as unknown as Record<string, unknown>];
    mocks.getDb.mockResolvedValue(createFakeDb());
  });

  it("يحذف السجل ويوثّق snapshot", async () => {
    await ownerDeleteAttendanceRecord({ recordId: 21, actorUserId: 1, reason: REASON });

    expect(mocks.deletes).toHaveLength(1);
    const audit = mocks.inserts.find(entry => entry.values.action === "attendance.owner_delete");
    expect(audit).toBeTruthy();
    expect(audit?.values).toMatchObject({ actorUserId: 1, entityType: "attendance", entityId: 21 });
  });
});
