import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalRequests, attendanceRecords, notifications, personProfiles, scoreEvents } from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));

import { runAttendanceAccountabilityCycle } from "./attendance-confirmation";
import { dateRangeForSaudiDay } from "../task-automation";

/* محاكي قاعدة بيانات يطبّق شروط where الخاصة بدورة المساءلة (eq/gte/lt/inArray/and). */

function unwrapParam(v: any): any {
  if (Array.isArray(v)) return v.map(unwrapParam);
  if (v && typeof v === "object" && "value" in v) return v.value;
  return v;
}

function collectPredicates(cond: any, out: Array<{ col: string; op: string; value: any }>): void {
  if (!cond || typeof cond !== "object") return;
  const chunks = cond.queryChunks;
  if (!Array.isArray(chunks)) return;
  const colChunk = chunks.find(
    (c: any) => c && typeof c === "object" && !Array.isArray(c) && typeof c.name === "string" && !("queryChunks" in c) && !("value" in c)
  );
  if (colChunk) {
    const col = colChunk.name;
    const idx = chunks.indexOf(colChunk);
    const opChunk = chunks[idx + 1];
    const op = opChunk && Array.isArray(opChunk.value) ? opChunk.value.join("") : "";
    out.push({ col, op, value: unwrapParam(chunks[idx + 2]) });
    return;
  }
  for (const chunk of chunks) {
    if (chunk && typeof chunk === "object" && !Array.isArray(chunk) && Array.isArray(chunk.queryChunks)) {
      collectPredicates(chunk, out);
    }
  }
}

function compareValues(a: any, b: any): number {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : a ? new Date(a).getTime() : 0;
    const tb = b instanceof Date ? b.getTime() : b ? new Date(b).getTime() : 0;
    return ta - tb;
  }
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function evalCondition(cond: any, row: any): boolean {
  const preds: Array<{ col: string; op: string; value: any }> = [];
  collectPredicates(cond, preds);
  return preds.every((p) => {
    const rowVal = row[p.col];
    if (p.op.includes(" in ")) {
      const arr = Array.isArray(p.value) ? p.value : [p.value];
      return arr.includes(rowVal);
    }
    if (p.op.includes(">=")) return compareValues(rowVal, p.value) >= 0;
    if (p.op.includes("<=")) return compareValues(rowVal, p.value) <= 0;
    if (p.op.includes("=")) return compareValues(rowVal, p.value) === 0;
    if (p.op.includes(">")) return compareValues(rowVal, p.value) > 0;
    if (p.op.includes("<")) return compareValues(rowVal, p.value) < 0;
    return true;
  });
}

function makeFakeDb() {
  const rowsByTable = new Map<object, any[]>();
  const setRows = (table: object, rows: any[]) => rowsByTable.set(table, rows);
  const state = { inserts: [] as Array<Record<string, any>> };

  const makeChain = () => {
    let table: object | null = null;
    let whereCond: any = null;
    const c: any = {
      from: (t: object) => {
        table = t;
        return c;
      },
      where: (cond: any) => {
        whereCond = cond;
        return c;
      },
      orderBy: () => c,
      limit: () => c,
      then: (resolve: (v: any) => void) => {
        const rows = table ? rowsByTable.get(table) ?? [] : [];
        resolve(whereCond ? rows.filter((row: any) => evalCondition(whereCond, row)) : rows);
      },
    };
    return c;
  };

  const insertResult = (values: Record<string, any>) => {
    state.inserts.push(values);
    const thenable: any = {
      then: (resolve: any) => resolve([{ insertId: state.inserts.length }]),
      onDuplicateKeyUpdate: () => ({ then: (resolve: any) => resolve([{ insertId: state.inserts.length }]) }),
    };
    return thenable;
  };

  return { select: () => makeChain(), insert: () => ({ values: insertResult }), setRows, state };
}

describe("مساءلة عدم تأكيد الحضور (المسار الثاني)", () => {
  const now = new Date(Date.UTC(2026, 7, 20, 8, 0, 0));
  const { start } = dateRangeForSaudiDay(now);
  const sentAt = new Date(start.getTime() + 60 * 60 * 1000); // بعد ساعة من بداية اليوم السعودي

  beforeEach(() => {
    mocks.getDb.mockReset();
  });

  it("ينشئ مساءلة وخصم نقطة وينبّه المدير المباشر عند تجاوز النافذة دون تأكيد", async () => {
    const db = makeFakeDb();
    mocks.getDb.mockResolvedValue(db);
    db.setRows(notifications, [{ profileId: 7, category: "attendance_confirmation", sentAt }]);
    db.setRows(attendanceRecords, []);
    db.setRows(approvalRequests, []);
    db.setRows(personProfiles, [{ id: 7, fullName: "فهد العتيبي", directManagerProfileId: 3 }]);
    db.setRows(scoreEvents, []);

    const result = await runAttendanceAccountabilityCycle(new Date(sentAt.getTime() + 30 * 60 * 1000));

    expect(result.checked).toBe(1);
    expect(result.penalized).toBe(1);
    const discipline = db.state.inserts.find((i) => i.entityType === "disciplinary_action");
    expect(discipline).toMatchObject({ entityId: 7, currentRole: "human_resources_manager" });
    const penalty = db.state.inserts.find((i) => i.points === -1);
    expect(penalty).toMatchObject({ profileId: 7, points: -1 });
    const alert = db.state.inserts.find((i) => i.category === "security_alert");
    expect(alert).toMatchObject({ profileId: 3 });
  });

  it("لا يسجل مساءلة قبل انقضاء نافذة التأكيد", async () => {
    const db = makeFakeDb();
    mocks.getDb.mockResolvedValue(db);
    db.setRows(notifications, [{ profileId: 7, category: "attendance_confirmation", sentAt }]);
    db.setRows(attendanceRecords, []);
    db.setRows(approvalRequests, []);
    db.setRows(personProfiles, [{ id: 7, fullName: "فهد العتيبي", directManagerProfileId: 3 }]);
    db.setRows(scoreEvents, []);

    const result = await runAttendanceAccountabilityCycle(new Date(sentAt.getTime() + 5 * 60 * 1000));

    expect(result.checked).toBe(1);
    expect(result.penalized).toBe(0);
    expect(db.state.inserts).toHaveLength(0);
  });

  it("يتجاهل من سجل حضوره خلال اليوم", async () => {
    const db = makeFakeDb();
    mocks.getDb.mockResolvedValue(db);
    db.setRows(notifications, [{ profileId: 7, category: "attendance_confirmation", sentAt }]);
    db.setRows(attendanceRecords, [{ profileId: 7, recordDate: new Date(start.getTime() + 90 * 60 * 1000), status: "present" }]);
    db.setRows(approvalRequests, []);
    db.setRows(personProfiles, [{ id: 7, fullName: "فهد العتيبي", directManagerProfileId: 3 }]);
    db.setRows(scoreEvents, []);

    const result = await runAttendanceAccountabilityCycle(new Date(sentAt.getTime() + 30 * 60 * 1000));

    expect(result.penalized).toBe(0);
    expect(db.state.inserts).toHaveLength(0);
  });

  it("لا يكرر المساءلة لنفس اليوم (idempotent)", async () => {
    const db = makeFakeDb();
    mocks.getDb.mockResolvedValue(db);
    db.setRows(notifications, [{ profileId: 7, category: "attendance_confirmation", sentAt }]);
    db.setRows(attendanceRecords, []);
    db.setRows(approvalRequests, [{ entityType: "disciplinary_action", entityId: 7, status: "pending", createdAt: new Date(start.getTime() + 2 * 60 * 60 * 1000) }]);
    db.setRows(personProfiles, [{ id: 7, fullName: "فهد العتيبي", directManagerProfileId: 3 }]);
    db.setRows(scoreEvents, []);

    const result = await runAttendanceAccountabilityCycle(new Date(sentAt.getTime() + 30 * 60 * 1000));

    expect(result.penalized).toBe(0);
    expect(db.state.inserts).toHaveLength(0);
  });

  it("يخصم نقاطاً متدرجة عند تكرار عدم التأكيد", async () => {
    const db = makeFakeDb();
    mocks.getDb.mockResolvedValue(db);
    db.setRows(notifications, [{ profileId: 7, category: "attendance_confirmation", sentAt }]);
    db.setRows(attendanceRecords, []);
    db.setRows(approvalRequests, []);
    db.setRows(personProfiles, [{ id: 7, fullName: "فهد العتيبي", directManagerProfileId: 3 }]);
    db.setRows(scoreEvents, Array.from({ length: 6 }, (_, i) => ({ profileId: 7, reason: "عدم تأكيد بدء العمل خلال النافذة المحددة", createdAt: new Date(sentAt.getTime() - i * 24 * 60 * 60 * 1000) })));

    const result = await runAttendanceAccountabilityCycle(new Date(sentAt.getTime() + 30 * 60 * 1000));

    expect(result.penalized).toBe(1);
    const penalty = db.state.inserts.find((i) => typeof i.points === "number" && i.points < 0);
    expect(penalty.points).toBe(-2);
  });
});

