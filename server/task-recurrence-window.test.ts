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

describe("نافذة التكرار (start_date / end_date)", () => {
  // 2026-08-16 = الأحد، 2026-08-17 = الاثنين (أيام عمل)
  const baseTemplate = { id: 1, unitId: 5, title: "متابعة يومية", frequency: "daily", workdayOnly: true, dueHourLocal: 13, defaultAssigneeProfileId: null, intervalDays: null, specificDays: null, lastGeneratedAt: null, startDate: null, endDate: null };

  it("لا يُنشئ المهمة قبل تاريخ البدء (start_date مستقبلي)", async () => {
    const db = makeDb([{ ...baseTemplate, startDate: "2026-08-20" }], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(db);
    const res = await createRecurringTasksAndNotifications(new Date("2026-08-16T05:00:00Z"));
    expect(res.createdTasks).toBe(0);
    expect(db.state.taskInserts.length).toBe(0);
  });

  it("لا يُنشئ المهمة بعد تاريخ الانتهاء (end_date ماضٍ)", async () => {
    const db = makeDb([{ ...baseTemplate, endDate: "2026-08-10" }], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(db);
    const res = await createRecurringTasksAndNotifications(new Date("2026-08-16T05:00:00Z"));
    expect(res.createdTasks).toBe(0);
    expect(db.state.taskInserts.length).toBe(0);
  });

  it("يُنشئ المهمة ضمن نافذة البدء/الانتهاء", async () => {
    const db = makeDb([{ ...baseTemplate, startDate: "2026-08-01", endDate: "2026-08-31" }], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(db);
    const res = await createRecurringTasksAndNotifications(new Date("2026-08-16T05:00:00Z"));
    expect(res.createdTasks).toBe(1);
    expect(db.state.taskInserts.length).toBe(1);
  });

  it("يُنشئ المهمة في يوم البدء نفسه وفي يوم الانتهاء نفسه (حدود شاملة)", async () => {
    const startDay = makeDb([{ ...baseTemplate, startDate: "2026-08-16" }], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(startDay);
    const startRes = await createRecurringTasksAndNotifications(new Date("2026-08-16T05:00:00Z"));
    expect(startRes.createdTasks).toBe(1);

    const endDay = makeDb([{ ...baseTemplate, endDate: "2026-08-16" }], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(endDay);
    const endRes = await createRecurringTasksAndNotifications(new Date("2026-08-16T05:00:00Z"));
    expect(endRes.createdTasks).toBe(1);
  });

  it("يحترم الأيام المحددة (specific_days) مع النافذة الزمنية", async () => {
    const template = { ...baseTemplate, frequency: "specific_days", specificDays: JSON.stringify([1]), startDate: "2026-08-01", endDate: "2026-08-31" };

    // الأحد (اليوم 0) ليس ضمن الأيام المختارة → لا تُنشأ
    const sunday = makeDb([template], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(sunday);
    const sundayRes = await createRecurringTasksAndNotifications(new Date("2026-08-16T05:00:00Z"));
    expect(sundayRes.createdTasks).toBe(0);

    // الاثنين (اليوم 1) ضمن الأيام المختارة → تُنشأ
    const monday = makeDb([template], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(monday);
    const mondayRes = await createRecurringTasksAndNotifications(new Date("2026-08-17T05:00:00Z"));
    expect(mondayRes.createdTasks).toBe(1);
  });

  it("يحترم التكرار الأسبوعي (frequency=weekly يُنشأ يوم الأحد فقط)", async () => {
    const template = { ...baseTemplate, frequency: "weekly" };

    const sunday = makeDb([template], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(sunday);
    const sundayRes = await createRecurringTasksAndNotifications(new Date("2026-08-16T05:00:00Z"));
    expect(sundayRes.createdTasks).toBe(1);

    const monday = makeDb([template], [{ id: 10 }]);
    mocks.getDb.mockResolvedValue(monday);
    const mondayRes = await createRecurringTasksAndNotifications(new Date("2026-08-17T05:00:00Z"));
    expect(mondayRes.createdTasks).toBe(0);
  });
});
