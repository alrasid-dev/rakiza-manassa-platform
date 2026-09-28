import { describe, expect, it, vi } from "vitest";
import { attendanceRecords, leaveRequests, personProfiles, scoreEvents, tasks } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { suggestTaskAssignees, taskWorkloadWeight } from "./court-service";

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
