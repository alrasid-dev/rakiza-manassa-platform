import { describe, expect, it } from "vitest";
import { hijriMonthKey } from "./hijri-month";
import { PERMISSION_POLICY } from "./permission-policy";

describe("سياسة الاستئذان", () => {
  it("يحدد مفتاح الشهر الهجري (أم القرى) بصيغة سنة-شهر ثابتة", () => {
    const a = hijriMonthKey(new Date("2026-02-18T12:00:00+03:00"));
    const b = hijriMonthKey(new Date("2026-02-18T12:00:00+03:00"));
    expect(a).toBe(b);
    expect(a).toMatch(/^\d{4,5}-\d{1,2}$/);
  });

  it("يميز بين شهرين هجريين مختلفين", () => {
    const early = hijriMonthKey(new Date("2026-02-18T12:00:00+03:00"));
    const late = hijriMonthKey(new Date("2026-04-20T12:00:00+03:00"));
    expect(early).not.toBe(late);
  });

  it("يثبت حدود السياسة المعتمدة", () => {
    expect(PERMISSION_POLICY.maxMinutesPerRequest).toBe(240);
    expect(PERMISSION_POLICY.maxMinutesPerMonth).toBe(720);
    expect(PERMISSION_POLICY.maxRequestsBeforeOwnerApproval).toBe(3);
  });
});
