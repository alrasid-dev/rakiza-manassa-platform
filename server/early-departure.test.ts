import { describe, expect, it } from "vitest";
import { computeCheckoutBalance } from "./court-service";

describe("احتساب الرصيد اليومي عند الانصراف (computeCheckoutBalance) — سياسة البصمة الدقيقة", () => {
  it("الانصراف المبكر 07:01 يغطي الاستئذان أول 250 دقيقة ثم يُحسب السلبي 184", () => {
    // checkOutMin = 421 (07:01)، earlyMinutes = 855 - 421 = 434، السلبي = 434 - 250 = 184
    expect(computeCheckoutBalance(429, 421, 855)).toEqual({ positiveMinutes: 0, negativeMinutes: 184 });
  });

  it("الانصراف 10:00 يعطي سلبي 5 بعد خصم الاستئذان (earlyMinutes = 255)", () => {
    expect(computeCheckoutBalance(429, 600, 855)).toEqual({ positiveMinutes: 0, negativeMinutes: 5 });
  });

  it("الانصراف 11:00 يغطيه الاستئذان بالكامل (earlyMinutes = 195 ≤ 250 → سلبي 0)", () => {
    expect(computeCheckoutBalance(429, 660, 855)).toEqual({ positiveMinutes: 0, negativeMinutes: 0 });
  });

  it("الانصراف في الموعد 14:15 يعطي صفراً", () => {
    expect(computeCheckoutBalance(429, 855, 855)).toEqual({ positiveMinutes: 0, negativeMinutes: 0 });
  });

  it("الانصراف 14:30 (نهاية النافذة العادية) يعطي صفراً", () => {
    expect(computeCheckoutBalance(429, 870, 855)).toEqual({ positiveMinutes: 0, negativeMinutes: 0 });
  });

  it("الانصراف 14:45 يعطي إيجابي 15 (بعد نافذة 14:30)", () => {
    expect(computeCheckoutBalance(429, 885, 855)).toEqual({ positiveMinutes: 15, negativeMinutes: 0 });
  });
});
