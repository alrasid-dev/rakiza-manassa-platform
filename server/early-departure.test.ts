import { describe, expect, it } from "vitest";
import { computeCheckoutBalance } from "./court-service";

describe("احتساب الرصيد اليومي عند الانصراف (computeCheckoutBalance)", () => {
  it("الخروج المبكر 11:15 (قبل 14:15 بثلاث ساعات) يعطي سلبي 180", () => {
    const checkInMin = 429; // 07:09 الرياض
    const checkOutMin = 675; // 11:15 الرياض
    expect(computeCheckoutBalance(checkInMin, checkOutMin, 855)).toEqual({ positiveMinutes: 0, negativeMinutes: 180 });
  });

  it("الانصراف في الموعد 14:15 يعطي سلبي 0", () => {
    expect(computeCheckoutBalance(429, 855, 855)).toEqual({ positiveMinutes: 0, negativeMinutes: 0 });
  });

  it("الانصراف بعد نهاية الدوام 14:45 يعطي إيجابي 30", () => {
    expect(computeCheckoutBalance(429, 885, 855)).toEqual({ positiveMinutes: 30, negativeMinutes: 0 });
  });

  it("الخروج المبكر لموظف عن بُعد يُحسب بنفس المعادلة", () => {
    // نفس الحساب بغض النظر عن نمط الحضور (remote/mixed/in_person).
    expect(computeCheckoutBalance(429, 675, 855).negativeMinutes).toBe(180);
  });
});
