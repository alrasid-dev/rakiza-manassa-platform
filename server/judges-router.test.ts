import { describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";

const OWNER_EMAIL = ENV.platformOwnerEmail;

const mocks = vi.hoisted(() => ({
  listJudgesWithTraineeCounts: vi.fn(async () => [{ id: 300, fullName: "قاضٍ مختبر", personType: "judge", traineeCount: 0 }]),
  createJudgeWithAccount: vi.fn(async () => 301),
  updateJudgeProfile: vi.fn(async () => undefined),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return { ...actual, listJudgesWithTraineeCounts: mocks.listJudgesWithTraineeCounts, createJudgeWithAccount: mocks.createJudgeWithAccount, updateJudgeProfile: mocks.updateJudgeProfile, getAccessPermission: vi.fn(async () => "general_view") };
});

import { courtRouter } from "./routers/court";

describe("مسارات شؤون القضاة", () => {
  it("تعرض الملفات وتنشئ وتعدل ملف قاضٍ تحت صلاحية المالك", async () => {
    const owner = courtRouter.createCaller({ user: { id: 1, role: "admin", email: OWNER_EMAIL, name: "المالك", openId: "owner" } } as never);
    await expect(owner.judges.list()).resolves.toEqual([{ id: 300, fullName: "قاضٍ مختبر", personType: "judge", traineeCount: 0 }]);
    await expect(owner.judges.create({ fullName: "قاضٍ جديد", email: "judge@moj.gov.sa", judicialFormation: "الدائرة الأولى" })).resolves.toEqual({ id: 301 });
    expect(mocks.createJudgeWithAccount).toHaveBeenCalledWith(expect.objectContaining({ fullName: "قاضٍ جديد", email: "judge@moj.gov.sa", actorUserId: 1 }));
    await expect(owner.judges.update({ judgeId: 300, fullName: "قاضٍ مختبر", judicialFormation: "الدائرة الثانية", status: "active" })).resolves.toEqual({ success: true });
    expect(mocks.updateJudgeProfile).toHaveBeenCalledWith(expect.objectContaining({ judgeId: 300, judicialFormation: "الدائرة الثانية", actorUserId: 1 }));
  });

  it("يحجب قائمة القضاة والإنشاء والتعديل عن general_view غير القيادي", async () => {
    const viewer = courtRouter.createCaller({ user: { id: 2, role: "user", email: "viewer@court.example", name: "مطلع", openId: "viewer" } } as never);
    await expect(viewer.judges.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewer.judges.create({ fullName: "قاضٍ غير مسموح", email: "blocked@moj.gov.sa" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(viewer.judges.update({ judgeId: 300, fullName: "قاضٍ مختبر", status: "active" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
