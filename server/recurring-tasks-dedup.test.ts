import { describe, expect, it, vi } from "vitest";
import { leaveRequests, personProfiles, taskTemplates, tasks } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { createRecurringTasksAndNotifications } from "./court-service";

/** محاكي قاعدة بيانات يدعم مسار createRecurringTasksAndNotifications ويخزّن مهام tasks المُدرجة. */
function makeDb(templates: unknown[], assignees: unknown[]) {
  const state = { taskInserts: [] as Record<string, unknown>[] };
  return {
    select: (projection?: unknown) => {
      let table: unknown = null;
      const chain: any = {
        from: (t: unknown) => { table = t; return chain; },
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => void) => {
          let rows: unknown[] = [];
          if (table === taskTemplates) rows = templates;
          else if (table === personProfiles) rows = assignees;
          else if (table === leaveRequests) rows = [];
          else if (table === tasks) rows = projection != null ? state.taskInserts.map(() => ({ id: 1 })) : [];
          resolve(rows);
        },
      };
      return chain;
    },
    insert: (table: unknown) => ({ values: async (v: Record<string, unknown>) => { if (table === tasks) state.taskInserts.push(v); return [{ insertId: 1 }]; } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    state,
  };
}

describe("منع تكرار توليد المهام المتكررة (مفتاح الجدولة)", () => {
  const dailyTemplate = { id: 1, unitId: 5, title: "فرز الاحكام", frequency: "daily", workdayOnly: true, dueHourLocal: 13, defaultAssigneeProfileId: null, intervalDays: null, specificDays: null, lastGeneratedAt: null };

  it("التوليد خامل (تشغيله مرتين بنفس اليوم = مهمة واحدة فقط)", async () => {
    const db = makeDb([dailyTemplate], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(db);
    const now = new Date("2026-08-16T02:00:00Z"); // 05:00 الرياض (قبل السابعة)
    const first = await createRecurringTasksAndNotifications(now);
    expect(first.createdTasks).toBe(1);
    const second = await createRecurringTasksAndNotifications(now);
    expect(second.createdTasks).toBe(0);
    expect(db.state.taskInserts.length).toBe(1);
  });

  it("بعد السابعة صباحاً تُجدول المهمة لنفس اليوم ولا تُعاد في التشغيل التالي", async () => {
    const db = makeDb([dailyTemplate], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(db);
    const now = new Date("2026-08-16T05:00:00Z"); // 08:00 الرياض (بعد السابعة)
    const first = await createRecurringTasksAndNotifications(now);
    expect(first.createdTasks).toBe(1);
    const scheduled = db.state.taskInserts[0].scheduledFor as Date;
    // اليوم نفسه (الأحد) الساعة 07:00 الرياض = 04:00 UTC (لا إزاحة للغد)
    expect(scheduled.toISOString()).toBe("2026-08-16T04:00:00.000Z");
    const second = await createRecurringTasksAndNotifications(now);
    expect(second.createdTasks).toBe(0);
    expect(db.state.taskInserts.length).toBe(1);
  });
});

describe("إزالة قطع 07:00 — المهمة اليومية تُجدول لنفس اليوم دائماً", () => {
  const dailyTemplate = { id: 1, unitId: 5, title: "فرز الاحكام", frequency: "daily", workdayOnly: true, dueHourLocal: 13, defaultAssigneeProfileId: null, intervalDays: null, specificDays: null, lastGeneratedAt: null };
  const cases = [
    { label: "07:15 الرياض", utc: "2026-08-16T04:15:00Z" },
    { label: "10:00 الرياض", utc: "2026-08-16T07:00:00Z" },
    { label: "15:00 الرياض", utc: "2026-08-16T12:00:00Z" },
  ];
  for (const c of cases) {
    it(`مهمة الساعة ${c.label} → scheduledFor = اليوم`, async () => {
      const db = makeDb([dailyTemplate], [{ id: 10 }]);
      mocks.getDb.mockResolvedValue(db);
      const now = new Date(c.utc);
      const res = await createRecurringTasksAndNotifications(now);
      expect(res.createdTasks).toBe(1);
      const scheduled = db.state.taskInserts[0].scheduledFor as Date;
      expect(scheduled.toISOString()).toBe("2026-08-16T04:00:00.000Z");
    });
  }
});
