import { describe, expect, it, vi } from "vitest";

const now = new Date();
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => ({ select: vi.fn(() => ({ from: vi.fn(async () => state.rows) })) })) }));

import { listVisibleAnnouncements } from "./court-service";

describe("نطاق الإعلانات الداخلية", () => {
  it("يعرض العام وإعلان الوحدة فقط ويستبعد غير المنشور والمنتهي", async () => {
    state.rows = [
      { id: 1, title: "عام", visibility: "all", unitId: null, publishedAt: new Date(now.getTime() - 60_000), expiresAt: null },
      { id: 2, title: "وحدة 4", visibility: "unit_only", unitId: 4, publishedAt: new Date(now.getTime() - 30_000), expiresAt: null },
      { id: 3, title: "وحدة 6", visibility: "unit_only", unitId: 6, publishedAt: new Date(now.getTime() - 20_000), expiresAt: null },
      { id: 4, title: "منتهٍ", visibility: "all", unitId: null, publishedAt: new Date(now.getTime() - 10_000), expiresAt: new Date(now.getTime() - 1_000) },
      { id: 5, title: "غير منشور", visibility: "all", unitId: null, publishedAt: null, expiresAt: null },
    ];
    const visible = await listVisibleAnnouncements({ unitIds: [4], isLeadership: false });
    expect(visible.map(item => item.id)).toEqual([2, 1]);
  });

  it("يتيح للقيادة الاطلاع على الإعلانات التشغيلية السارية عبر الوحدات", async () => {
    const visible = await listVisibleAnnouncements({ unitIds: [4], isLeadership: true });
    expect(visible.map(item => item.id)).toEqual([3, 2, 1]);
  });
});
