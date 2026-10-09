import { describe, expect, it } from "vitest";
import { appliesNewPolicy, DEFAULT_EARLY_OPEN_HOURS, hasExplicitSchedule, NEW_POLICY_CUTOFF, NOTIFY_WORK_MINUTES, taskOpenAt, workMinutesDeadlineAt } from "./task-automation";

// CUTOFF = 2026-10-06 21:00 UTC = 2026-10-07 00:00 الرياض.
const after = new Date("2026-10-07T07:00:00.000Z"); // غداً (10:00 الرياض)
const before = new Date("2026-10-05T07:00:00.000Z"); // أمس

describe("سياسة الفلتر الزمني (NEW_POLICY_CUTOFF)", () => {
  it("المهمة المجدولة غداً تنطبق عليها السياسة الجديدة", () => {
    expect(after.getTime() >= NEW_POLICY_CUTOFF.getTime()).toBe(true);
    expect(appliesNewPolicy({ scheduledFor: after, dueAt: null, isOpen: false })).toBe(true);
  });

  it("المهمة المجدولة أمس لا تُعالج", () => {
    expect(before.getTime() < NEW_POLICY_CUTOFF.getTime()).toBe(true);
    expect(appliesNewPolicy({ scheduledFor: before, dueAt: null, isOpen: false })).toBe(false);
  });

  it("المهمة ذات مدة 4 ساعات صريحة تُحترم ولا تُفتح مبكراً", () => {
    const dueAt = new Date(after.getTime() + 4 * 60 * 60 * 1000);
    expect(hasExplicitSchedule({ scheduledFor: after, dueAt, isOpen: false })).toBe(true);
    expect(taskOpenAt({ scheduledFor: after, dueAt, isOpen: false }).toISOString()).toBe(after.toISOString());
  });

  it("المهمة ذات dueAt الافتراضي (450 دقيقة عمل) تُفتح مبكراً 4 ساعات", () => {
    const dueAt = workMinutesDeadlineAt(after, NOTIFY_WORK_MINUTES);
    expect(hasExplicitSchedule({ scheduledFor: after, dueAt, isOpen: false })).toBe(false);
    expect(taskOpenAt({ scheduledFor: after, dueAt, isOpen: false }).getTime()).toBe(after.getTime() - DEFAULT_EARLY_OPEN_HOURS * 60 * 60 * 1000);
  });

  it("المهمة ذات dueAt الصريح لا تُتجاوز بسياسة 7.5س/15س", () => {
    const dueAt = new Date(after.getTime() + 4 * 60 * 60 * 1000);
    expect(appliesNewPolicy({ scheduledFor: after, dueAt, isOpen: false })).toBe(false);
  });

  it("المهمة المفتوحة (isOpen) مستثناة", () => {
    expect(appliesNewPolicy({ scheduledFor: after, dueAt: null, isOpen: true })).toBe(false);
    expect(hasExplicitSchedule({ scheduledFor: after, dueAt: null, isOpen: true })).toBe(true);
    expect(taskOpenAt({ scheduledFor: after, dueAt: null, isOpen: true }).toISOString()).toBe(after.toISOString());
  });
});
