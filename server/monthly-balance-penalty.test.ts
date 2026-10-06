import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  selectQueue: [] as Record<string, unknown>[][],
}));

function selectChain(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.groupBy = () => chain;
  chain.limit = async () => rows;
  chain.then = (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject);
  return chain;
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: vi.fn(() => {
      const rows = state.selectQueue.shift() ?? [];
      return selectChain(rows);
    }),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        onDuplicateKeyUpdate: vi.fn(async () => {
          state.inserts.push(values);
          return [{ insertId: 1 }];
        }),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  })),
}));

import { recomputeMonthlyBalance } from "./court-service";

describe("إدراج عقوبات عدم الانصراف في الرصيد الشهري", () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.selectQueue.length = 0;
  });

  it("يجمع penaltyMinutes منفصلة عن negativeMinutes للموظف الحضوري (بدون بصمة)", async () => {
    // سجل حضور بدون بصمة دخول (in_person): سلبي 426 + عقوبة 240.
    state.selectQueue.push([
      { positiveMinutes: 0, negativeMinutes: 426, penaltyMinutes: 240, recordDate: new Date("2026-10-01T01:09:04.000Z"), checkInAt: null },
    ]);
    // فترات النمط التاريخي → فارغة.
    state.selectQueue.push([]);
    // النمط الحالي → in_person.
    state.selectQueue.push([{ mode: "in_person" }]);
    // استئذان واحد معتمد (excuse = 240).
    state.selectQueue.push([{ id: 1 }]);

    const result = await recomputeMonthlyBalance(60132, "1448-04");

    expect(result).toMatchObject({ positiveMinutes: 0, negativeMinutes: 426, penaltyMinutes: 240, excuseMinutes: 240, netMinutes: -426 });
    // يُخزَّن penaltyMinutes في monthly_balances.
    expect(state.inserts[0]).toMatchObject({ penaltyMinutes: 240, netMinutes: -426 });
  });

  it("الموظف عن بُعد (بصمة دخول) لا تُحسب عليه عقوبة negative/penalty", async () => {
    state.selectQueue.push([
      { positiveMinutes: 0, negativeMinutes: 426, penaltyMinutes: 240, recordDate: new Date("2026-10-01T04:09:04.000Z"), checkInAt: new Date("2026-10-01T04:09:04.000Z") },
    ]);
    state.selectQueue.push([]); // periods فارغة
    state.selectQueue.push([{ mode: "in_person" }]); // النمط الحالي in_person لكن مع بصمة → remote
    state.selectQueue.push([{ id: 1 }]); // استئذان

    const result = await recomputeMonthlyBalance(60132, "1448-04");
    expect(result.negativeMinutes).toBe(0);
    expect(result.penaltyMinutes).toBe(0);
    expect(result.netMinutes).toBe(240); // 0 − 0 − 0 + 240
  });

  it("عندما لا توجد عقوبات تكون penaltyMinutes = 0", async () => {
    state.selectQueue.push([
      { positiveMinutes: 0, negativeMinutes: 180, penaltyMinutes: 0, recordDate: new Date("2026-10-04T21:00:00.000Z"), checkInAt: null },
    ]);
    state.selectQueue.push([]);
    state.selectQueue.push([{ mode: "in_person" }]);
    state.selectQueue.push([]);

    const result = await recomputeMonthlyBalance(60132, "1448-04");
    expect(result.penaltyMinutes).toBe(0);
    expect(result.netMinutes).toBe(-180);
  });
});
