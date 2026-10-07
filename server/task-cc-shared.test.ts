import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { taskCc } from "../drizzle/schema";
import { assertNotCcViewer, listTasksSharedWithProfile } from "./court-service";

/** نموذج DB يتمايز حسب الجدول المُمرَّر إلى from() ويرجع الصفوف المطلوبة. */
function makeDb(rowsByTable: Map<unknown, unknown[]>) {
  const resolve = (table: unknown) => rowsByTable.get(table) ?? [];
  const query = (table: unknown): any => ({
    where: () => query(table),
    limit: () => Promise.resolve(resolve(table)),
    orderBy: () => Promise.resolve(resolve(table)),
    innerJoin: () => query(table),
  });
  return {
    select: () => ({
      from: (table: unknown) => query(table),
    }),
  };
}

describe("مشاركة معي (CC) — الصلاحيات", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listTasksSharedWithProfile يعيد المهام التي المستخدم مُطّلع عليها فقط", async () => {
    const sharedRows = [{ id: 7, title: "مهمة مطّلع عليها", status: "under_review" }];
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb(new Map([[taskCc, sharedRows]])));
    const result = await listTasksSharedWithProfile(10);
    expect(result).toEqual(sharedRows);
  });

  it("listTasksSharedWithProfile يعيد قائمة فارغة عند غياب قاعدة البيانات", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await listTasksSharedWithProfile(10)).toEqual([]);
  });

  it("assertNotCcViewer يرمي خطأ عندما يكون المستخدم مُطّلعاً فقط", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb(new Map([[taskCc, [{ id: 1 }]]])));
    await expect(assertNotCcViewer(7, 10)).rejects.toMatchObject({ message: "أنت مُطّلع فقط على هذه المهمة." });
  });

  it("assertNotCcViewer يسمح لمن ليس مُطّلعاً", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeDb(new Map([[taskCc, []]])));
    await expect(assertNotCcViewer(7, 10)).resolves.toBeUndefined();
  });
});
