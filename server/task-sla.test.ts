import { describe, expect, it } from "vitest";
import { taskStartDeadline, taskReviewDeadline, taskDueNudgeKind, TASK_START_DEADLINE_HOURS, TASK_REVIEW_DEADLINE_HOURS } from "./task-response-policy";

describe("SLA المهام", () => {
  it("تحدد مهلة بدء المهمة بساعتين", () => {
    const start = new Date("2026-08-20T07:00:00Z");
    expect(taskStartDeadline(start).toISOString()).toBe("2026-08-20T09:00:00.000Z");
    expect(TASK_START_DEADLINE_HOURS).toBe(2);
  });

  it("تحدد مهلة المراجعة بـ 24 ساعة", () => {
    const submitted = new Date("2026-08-20T07:00:00Z");
    expect(taskReviewDeadline(submitted).toISOString()).toBe("2026-08-21T07:00:00.000Z");
    expect(TASK_REVIEW_DEADLINE_HOURS).toBe(24);
  });

  it("يحدد تنبيهات 24/12/1 ساعة قبل الموعد", () => {
    const dueAt = new Date("2026-08-20T12:00:00Z");
    expect(taskDueNudgeKind(dueAt, new Date("2026-08-20T11:30:00Z"))).toBe("1h");
    expect(taskDueNudgeKind(dueAt, new Date("2026-08-20T02:00:00Z"))).toBe("12h");
    expect(taskDueNudgeKind(dueAt, new Date("2026-08-19T14:00:00Z"))).toBe("24h");
    expect(taskDueNudgeKind(dueAt, new Date("2026-08-20T12:00:00Z"))).toBe("none");
  });
});
