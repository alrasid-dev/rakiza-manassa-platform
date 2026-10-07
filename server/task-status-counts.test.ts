import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { countTasksByStatus } from "./court-service";

function makeDb(rows: { status: string; isOpen: boolean }[]) {
  return {
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
  };
}

describe("countTasksByStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("يعدّ المهام لكل حالة ويحسب المفتوحة بشكل منفصل", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb([
      { status: "in_progress", isOpen: false },
      { status: "in_progress", isOpen: true },
      { status: "overdue", isOpen: false },
      { status: "completed", isOpen: false },
      { status: "new", isOpen: false },
    ]));
    const result = await countTasksByStatus({});
    expect(result.in_progress).toBe(2);
    expect(result.overdue).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.new).toBe(1);
    expect(result.open).toBe(1);
    expect(result.paused).toBe(0);
  });

  it("يعيد أصفاراً عند عدم توفر قاعدة البيانات", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await countTasksByStatus({});
    expect(result).toEqual({ new: 0, in_progress: 0, under_review: 0, completed: 0, overdue: 0, cancelled: 0, paused: 0, open: 0 });
  });
});
