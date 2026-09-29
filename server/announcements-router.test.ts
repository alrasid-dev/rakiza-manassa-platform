import { describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";

const OWNER_EMAIL = ENV.platformOwnerEmail;

const mocks = vi.hoisted(() => ({
  listVisibleAnnouncements: vi.fn(async () => [{ id: 31, title: "إعلان عام", body: "نص الإعلان", visibility: "all" }]),
  createAnnouncement: vi.fn(async () => 31),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return { ...actual, listVisibleAnnouncements: mocks.listVisibleAnnouncements, createAnnouncement: mocks.createAnnouncement, getAccessPermission: vi.fn(async (email: string | null) => email === OWNER_EMAIL ? "full_control" : null), getProfileForUser: vi.fn(async () => ({ id: 7, unitId: 4 })) };
});

import { courtRouter } from "./routers/court";

describe("مركز الإعلانات الداخلية", () => {
  it("يعرض الإعلانات من خلال خدمة النطاق وينشر المالك إعلاناً عاماً", async () => {
    const owner = courtRouter.createCaller({ user: { id: 1, role: "admin", email: OWNER_EMAIL, name: "المالك", openId: "owner" } } as never);
    await expect(owner.announcements.list()).resolves.toEqual([expect.objectContaining({ id: 31, title: "إعلان عام" })]);
    expect(mocks.listVisibleAnnouncements).toHaveBeenCalledWith({ unitIds: [4], isLeadership: true });
    await expect(owner.announcements.create({ title: "تنبيه داخلي", body: "هذا إعلان تشغيلي", visibility: "all" })).resolves.toEqual({ id: 31 });
    expect(mocks.createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ title: "تنبيه داخلي", visibility: "all", createdByUserId: 1 }));
  });

  it("يحجب نشر الإعلان عن غير مالك المنصة", async () => {
    const user = courtRouter.createCaller({ user: { id: 7, role: "user", email: "user@court.example", name: "مستخدم", openId: "user" } } as never);
    await expect(user.announcements.create({ title: "إعلان غير مصرح", body: "لا يجب نشر هذا الإعلان", visibility: "all" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
