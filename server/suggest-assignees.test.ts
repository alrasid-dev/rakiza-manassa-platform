import { describe, expect, it, vi } from "vitest";
import { attendanceRecords, leaveRequests, personProfiles, scoreEvents, tasks } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { autoAssignTasks, suggestTaskAssignees, taskWorkloadWeight } from "./court-service";

function makeFakeDb() {
  const rowsByTable = new Map<object, unknown[]>();
  const setRows = (table: object, rows: unknown[]) => rowsByTable.set(table, rows);
  const makeChain = () => {
    let table: object | null = null;
    const c: any = {
      from: (t: object) => { table = t; return c; },
      innerJoin: () => c,
      leftJoin: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      groupBy: () => c,
      then: (resolve: (v: unknown) => void) => resolve(table ? (rowsByTable.get(table) ?? []) : []),
    };
    return c;
  };
  return { select: () => makeChain(), setRows };
}

/** محاكي قاعدة بيانات يدعم update/insert ويطبّق فلتر unitId في شرط where لتغطية نطاق التوزيع. */
function makeAssignDb() {
  const rowsByTable = new Map<object, unknown[]>();
  const setRows = (table: object, rows: unknown[]) => rowsByTable.set(table, rows);
  const state = { updates: [] as Record<string, unknown>[], inserts: [] as Record<string, unknown>[] };

  const unwrapParam = (v: any) => (v && typeof v === "object" && !Array.isArray(v) && "value" in v ? v.value : v);
  const toNumbers = (v: any): number[] => {
    const unwrapped = unwrapParam(v);
    if (Array.isArray(unwrapped)) return unwrapped.flatMap((item: any) => toNumbers(item));
    return unwrapped == null ? [] : [unwrapped];
  };

  const extractUnitIds = (cond: any, out: number[] = []): number[] => {
    const chunks = cond?.queryChunks;
    if (!Array.isArray(chunks)) return out;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || typeof chunk !== "object") continue;
      if (chunk.name === "unitId") {
        const opChunk = chunks[i + 1];
        if (opChunk && typeof opChunk === "object" && Array.isArray(opChunk.value)) {
          const op = opChunk.value.join("");
          if (op.includes(" in ") || op.includes("=")) {
            out.push(...toNumbers(chunks[i + 2]));
          }
        }
      } else if (Array.isArray(chunk.queryChunks)) {
        extractUnitIds(chunk, out);
      }
    }
    return out;
  };

  const makeChain = () => {
    let table: object | null = null;
    let whereCond: unknown = null;
    const c: any = {
      from: (t: object) => { table = t; return c; },
      innerJoin: () => c,
      leftJoin: () => c,
      where: (cond: unknown) => { whereCond = cond; return c; },
      orderBy: () => c,
      limit: () => c,
      groupBy: () => c,
      then: (resolve: (v: unknown) => void) => {
        const rows = table ? (rowsByTable.get(table) ?? []) : [];
        const unitIds = extractUnitIds(whereCond);
        resolve(unitIds.length ? rows.filter((row: any) => unitIds.includes(row.unitId)) : rows);
      },
    };
    return c;
  };

  return {
    select: () => makeChain(),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { state.updates.push(values); } }) }),
    insert: () => ({ values: async (values: Record<string, unknown>) => { state.inserts.push(values); return [{ insertId: state.inserts.length }]; } }),
    setRows,
    state,
  };
}

describe("خوارزمية التوزيع الذكي", () => {
  it("يحسب وزن المهمة بشكل صحيح (overdue = 1.5)", () => {
    expect(taskWorkloadWeight("new", null)).toBe(1);
    expect(taskWorkloadWeight("in_progress", new Date())).toBe(1);
    expect(taskWorkloadWeight("under_review")).toBe(0.5);
    expect(taskWorkloadWeight("overdue")).toBe(1.5);
    expect(taskWorkloadWeight("completed")).toBe(0);
    expect(taskWorkloadWeight("cancelled")).toBe(0);
  });

  it("يستبعد الغائب والمجاز ويعيد المتاح فقط", async () => {
    const db = makeFakeDb();
    mocks.getDb.mockResolvedValue(db);
    db.setRows(personProfiles, [
      { id: 1, fullName: "فهد", createdAt: new Date("2026-01-01") },
      { id: 2, fullName: "سليمان", createdAt: new Date("2026-02-01") },
      { id: 3, fullName: "البراء", createdAt: new Date("2026-03-01") },
    ]);
    db.setRows(attendanceRecords, [{ profileId: 1, recordDate: new Date(), status: "absent" }]);
    db.setRows(leaveRequests, [{ profileId: 2, startAt: new Date(Date.now() - 86400000), endAt: new Date(Date.now() + 86400000), status: "approved" }]);
    db.setRows(tasks, []);
    db.setRows(scoreEvents, []);

    const result = await suggestTaskAssignees(5);
    expect(result.map(r => r.profileId)).toEqual([3]);
  });

  it("يرتب المرشحين من الأقل حملاً أولاً", async () => {
    const db = makeFakeDb();
    mocks.getDb.mockResolvedValue(db);
    db.setRows(personProfiles, [
      { id: 1, fullName: "فهد", createdAt: new Date("2026-01-01") },
      { id: 2, fullName: "سليمان", createdAt: new Date("2026-02-01") },
    ]);
    db.setRows(attendanceRecords, []);
    db.setRows(leaveRequests, []);
    db.setRows(tasks, [{ assigneeProfileId: 2, status: "new", startedAt: null, archivedAt: null }]);
    db.setRows(scoreEvents, []);

    const result = await suggestTaskAssignees(5);
    expect(result.map(r => r.profileId)).toEqual([1, 2]);
  });
});

describe("نطاق صلاحية التوزيع التلقائي", () => {
  it("يرفض مدير القسم توزيع قسم خارج نطاقه", async () => {
    const db = makeAssignDb();
    mocks.getDb.mockResolvedValue(db);
    await expect(
      autoAssignTasks({ unitId: 5, actorUserId: 1, actorPermission: "employee", actorManagedUnitIds: [2] })
    ).rejects.toThrow("هذا القسم خارج نطاق صلاحيتك للتوزيع.");
  });

  it("يوزّع مدير القسم المهام غير المسندة ضمن أقسامه فقط عند عدم تحديد قسم", async () => {
    const db = makeAssignDb();
    mocks.getDb.mockResolvedValue(db);
    db.setRows(personProfiles, [
      { id: 10, fullName: "فهد", unitId: 2, createdAt: new Date("2026-01-01") },
      { id: 20, fullName: "علي", unitId: 5, createdAt: new Date("2026-01-01") },
    ]);
    db.setRows(attendanceRecords, []);
    db.setRows(leaveRequests, []);
    db.setRows(scoreEvents, []);
    db.setRows(tasks, [
      { id: 1, title: "مهمة شؤون الملازمين", unitId: 2, assigneeProfileId: null, archivedAt: null, status: "new", startedAt: null, dueAt: new Date() },
      { id: 2, title: "مهمة القسم النسائي", unitId: 5, assigneeProfileId: null, archivedAt: null, status: "new", startedAt: null, dueAt: new Date() },
    ]);

    const result = await autoAssignTasks({ unitId: undefined, actorUserId: 1, actorPermission: "employee", actorManagedUnitIds: [2] });

    expect(result.assigned).toBe(1);
    expect(result.skipped).toBe(0);
    expect(db.state.updates).toEqual([expect.objectContaining({ assigneeProfileId: 10, assignedByUserId: 1 })]);
  });

  it("يوزّع المالك المهام في أي قسم يحدده", async () => {
    const db = makeAssignDb();
    mocks.getDb.mockResolvedValue(db);
    db.setRows(personProfiles, [
      { id: 10, fullName: "فهد", unitId: 2, createdAt: new Date("2026-01-01") },
      { id: 20, fullName: "علي", unitId: 5, createdAt: new Date("2026-01-01") },
    ]);
    db.setRows(attendanceRecords, []);
    db.setRows(leaveRequests, []);
    db.setRows(scoreEvents, []);
    db.setRows(tasks, [
      { id: 1, title: "مهمة شؤون الملازمين", unitId: 2, assigneeProfileId: null, archivedAt: null, status: "new", startedAt: null, dueAt: new Date() },
      { id: 2, title: "مهمة القسم النسائي", unitId: 5, assigneeProfileId: null, archivedAt: null, status: "new", startedAt: null, dueAt: new Date() },
    ]);

    const result = await autoAssignTasks({ unitId: 5, actorUserId: 1, actorPermission: "full_control", actorManagedUnitIds: null });

    expect(result.assigned).toBe(1);
    expect(result.skipped).toBe(0);
    expect(db.state.updates).toEqual([expect.objectContaining({ assigneeProfileId: 20, assignedByUserId: 1 })]);
  });
});
