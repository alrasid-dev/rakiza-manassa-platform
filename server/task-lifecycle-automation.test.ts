import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[] }));

function selectChain(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.groupBy = () => chain;
  chain.limit = async () => rows;
  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject);
  return chain;
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: vi.fn(() =>
      selectChain([
        { id: 9, title: "مهمة مفتوحة", scheduledFor: new Date("2026-08-10T07:00:00Z"), status: "in_progress", isOpen: true, assigneeProfileId: 10 },
      ]),
    ),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        state.inserts.push(values);
        return [{ insertId: state.inserts.length }];
      }),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  })),
}));

import { markOverdueTasks } from "./court-service";

describe("runTaskLifecycleAutomation — استثناء المهام المفتوحة", () => {
  beforeEach(() => {
    state.inserts.length = 0;
  });

  it("المهام المفتوحة (isOpen) مستثناة من كل الفحوص الزمنية", async () => {
    // الأحد 07:00 بتوقيت الرياض (داخل نافذة العمل).
    const now = new Date("2026-08-16T04:00:00Z");
    const result = await markOverdueTasks(now);
    expect(result).toEqual({ marked: 0 });
  });
});
