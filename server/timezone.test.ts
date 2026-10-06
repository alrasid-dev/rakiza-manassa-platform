import { describe, expect, it } from "vitest";
import { riyadhMinutesOfDay, toRiyadhDate } from "./court-service";

describe("توحيد معالجة التوقيت (UTC → الرياض)", () => {
  it("riyadhMinutesOfDay(01:09 UTC) = 249 (04:09 الرياض)", () => {
    expect(riyadhMinutesOfDay(new Date("2026-10-01T01:09:00.000Z"))).toBe(249);
  });

  it("riyadhMinutesOfDay(04:09 UTC) = 429 (07:09 الرياض)", () => {
    expect(riyadhMinutesOfDay(new Date("2026-10-01T04:09:00.000Z"))).toBe(429);
  });

  it("toRiyadhDate يضيف 3 ساعات بالضبط", () => {
    expect(toRiyadhDate(new Date("2026-10-01T01:09:00.000Z")).toISOString()).toBe("2026-10-01T04:09:00.000Z");
  });

  it("بصمة مخزّنة 04:09 UTC تُعامل 07:09 الرياض في الحساب (429 → سلبي 426)", () => {
    const checkInMin = riyadhMinutesOfDay(new Date("2026-10-01T04:09:00.000Z"));
    const negative = 855 - checkInMin;
    expect(negative).toBe(426);
  });
});
