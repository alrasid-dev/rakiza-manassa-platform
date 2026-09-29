import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[] }));

function selectChain(rows: Record<string, unknown>[] = [{ status: "active" }]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.leftJoin = () => chain;
  chain.limit = async () => rows;
  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject);
  return chain;
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: vi.fn(() => selectChain([{ status: "active" }])),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        state.inserts.push(values);
        return [{ insertId: state.inserts.length }];
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        state.updates.push(values);
        return { where: vi.fn(async () => undefined) };
      }),
    })),
  })),
}));

import { createTask } from "./court-service";

describe("ربط تكرار المهمة بإنشاء قالب تلقائي", () => {
  beforeEach(() => { state.inserts.length = 0; state.updates.length = 0; });

  it("ينشئ قالباً ويربط المهمة به عند إنشاء مهمة بتكرار يومي", async () => {
    await createTask({
      title: "تدوين الإحاطة اليومية",
      unitId: 3,
      assigneeProfileId: 10,
      priority: "normal",
      scheduledFor: new Date("2026-08-16T07:00:00Z"),
      dueAt: new Date("2026-08-16T14:00:00Z"),
      assignedByUserId: 1,
      recurrence: "daily",
    });

    const templateInsert = state.inserts.find(item => (item as Record<string, unknown>).frequency === "daily");
    expect(templateInsert).toMatchObject({ title: "تدوين الإحاطة اليومية", unitId: 3, frequency: "daily", isActive: true, workdayOnly: true });
    expect(state.updates.some(item => (item as Record<string, unknown>).templateId != null)).toBe(true);
  });

  it("لا ينشئ قالباً عند إنشاء مهمة بدون تكرار", async () => {
    await createTask({
      title: "مهمة عادية",
      unitId: 3,
      assigneeProfileId: 10,
      priority: "normal",
      scheduledFor: new Date("2026-08-16T07:00:00Z"),
      dueAt: new Date("2026-08-16T14:00:00Z"),
      assignedByUserId: 1,
    });

    expect(state.inserts.some(item => (item as Record<string, unknown>).frequency)).toBe(false);
    expect(state.updates.some(item => (item as Record<string, unknown>).templateId != null)).toBe(false);
  });
});
