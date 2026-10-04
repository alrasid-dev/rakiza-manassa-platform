import { describe, expect, it } from "vitest";
import { isDueSoon } from "./court-service";

describe("isDueSoon — تعريف موحّد لقرب الموعد", () => {
  it("يعيد true للمهمة المستحقة خلال 24 ساعة", () => {
    const now = new Date("2026-10-04T20:00:00Z");
    const task = { dueAt: new Date("2026-10-05T14:00:00Z"), status: "new" };
    expect(isDueSoon(task, now)).toBe(true);
  });

  it("يعيد true للمهمة المجدولة ليوم غدٍ", () => {
    const now = new Date("2026-10-04T20:00:00Z");
    const task = { scheduledFor: new Date("2026-10-05T08:00:00Z"), status: "new" };
    expect(isDueSoon(task, now)).toBe(true);
  });

  it("يعيد false للمهمة المكتملة", () => {
    const now = new Date("2026-10-04T20:00:00Z");
    const task = { dueAt: new Date("2026-10-05T14:00:00Z"), status: "completed" };
    expect(isDueSoon(task, now)).toBe(false);
  });

  it("يعيد false للمهمة الموقوفة أو الملغاة", () => {
    const now = new Date("2026-10-04T20:00:00Z");
    expect(isDueSoon({ dueAt: new Date("2026-10-05T14:00:00Z"), status: "paused" }, now)).toBe(false);
    expect(isDueSoon({ dueAt: new Date("2026-10-05T14:00:00Z"), status: "cancelled" }, now)).toBe(false);
  });

  it("يعيد false للمهمة المستحقة بعد أكثر من 24 ساعة وغير المجدولة غداً", () => {
    const now = new Date("2026-10-04T20:00:00Z");
    const task = { dueAt: new Date("2026-10-06T14:00:00Z"), scheduledFor: new Date("2026-10-05T08:00:00Z"), status: "new" };
    // الاستحقاق بعد أكثر من 24 ساعة لكنها مجدولة غداً → true
    expect(isDueSoon(task, now)).toBe(true);

    const farTask = { dueAt: new Date("2026-10-07T14:00:00Z"), scheduledFor: new Date("2026-10-06T08:00:00Z"), status: "new" };
    expect(isDueSoon(farTask, now)).toBe(false);
  });
});
