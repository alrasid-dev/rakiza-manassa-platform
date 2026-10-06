import { beforeEach, describe, expect, it, vi } from "vitest";
import { isLateExcuseRequest } from "./court-service";

const t = (s: string) => new Date(s);

describe("كشف الاستئذان المتأخر (isLateExcuseRequest)", () => {
  it("يكشف الاستئذان المتأخر (بداية == نهاية، مدة 240، permission)", () => {
    expect(isLateExcuseRequest({ requestType: "permission", startAt: t("2026-10-01T08:15:00Z"), endAt: t("2026-10-01T08:15:00Z"), durationMinutes: 240 })).toBe(true);
  });

  it("يكشف الاستئذان المتأخر بمدة 0", () => {
    expect(isLateExcuseRequest({ requestType: "permission", startAt: t("2026-10-01T08:15:00Z"), endAt: t("2026-10-01T08:15:00Z"), durationMinutes: 0 })).toBe(true);
  });

  it("لا يعتبر الاستئذان العادي (بداية != نهاية) استئذاناً متأخراً", () => {
    expect(isLateExcuseRequest({ requestType: "permission", startAt: t("2026-10-01T08:00:00Z"), endAt: t("2026-10-01T12:00:00Z"), durationMinutes: 240 })).toBe(false);
  });

  it("لا يعتبر الإجازة (leave) استئذاناً متأخراً", () => {
    expect(isLateExcuseRequest({ requestType: "leave", startAt: t("2026-10-01T08:00:00Z"), endAt: t("2026-10-01T08:00:00Z"), durationMinutes: 240 })).toBe(false);
  });
});
