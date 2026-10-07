import { describe, expect, it } from "vitest";
import { calculateWorkMinutesBetween, computeTaskPerformanceStats } from "./court-service";

describe("دقة تقرير مقارنة المهام", () => {
  it("يفصل «في الوقت» عن «أُنجزت متأخرة» عن «لم تُنجز»", () => {
    const rows = [
      { assigneeProfileId: 1, status: "completed", dueAt: new Date("2026-09-27T11:15:00Z"), completedAt: new Date("2026-09-27T10:00:00Z"), scheduledFor: new Date("2026-09-27T05:00:00Z") },
      { assigneeProfileId: 1, status: "completed", dueAt: new Date("2026-09-27T11:15:00Z"), completedAt: new Date("2026-09-28T05:00:00Z"), scheduledFor: new Date("2026-09-27T05:00:00Z") },
      { assigneeProfileId: 1, status: "overdue", dueAt: new Date("2026-09-27T11:15:00Z"), completedAt: null, scheduledFor: new Date("2026-09-27T05:00:00Z") },
    ];
    const s = computeTaskPerformanceStats(rows).get(1)!;
    expect(s.total).toBe(3);
    expect(s.completed).toBe(2);
    expect(s.onTime).toBe(1);
    expect(s.lateCompleted).toBe(1);
    expect(s.stillOverdue).toBe(1);
  });

  it("يحسب ساعات العمل فقط (بلا ليالٍ): 24 ساعة جدارية = 435 د عمل وليس 1440 د", () => {
    const start = new Date("2026-09-27T05:00:00Z"); // الأحد 08:00 الرياض
    const end = new Date("2026-09-28T05:00:00Z"); // الاثنين 08:00 الرياض
    expect(calculateWorkMinutesBetween(start, end)).toBe(435);
  });

  it("لا ينتج قيماً سالبة عند الإنجاز قبل البدء", () => {
    const rows = [
      { assigneeProfileId: 1, status: "completed", dueAt: new Date("2026-09-27T11:15:00Z"), completedAt: new Date("2026-09-27T04:00:00Z"), scheduledFor: new Date("2026-09-27T05:00:00Z") },
    ];
    const s = computeTaskPerformanceStats(rows).get(1)!;
    expect(s.completionMinutes).toEqual([0]);
    expect(s.onTime).toBe(1);
  });

  it("من لم يُنجز (completed=0) لا يُعتبر مُقيَّماً", () => {
    const rows = [
      { assigneeProfileId: 1, status: "overdue", dueAt: new Date("2026-09-27T11:15:00Z"), completedAt: null, scheduledFor: new Date("2026-09-27T05:00:00Z") },
    ];
    const s = computeTaskPerformanceStats(rows).get(1)!;
    expect(s.completed).toBe(0);
    expect(s.completed > 0).toBe(false); // assigned = completed > 0 → false
  });

  it("معدل الالتزام يعتمد على «في الوقت» (onTime) لا الإنجاز", () => {
    const rows = [
      { assigneeProfileId: 1, status: "completed", dueAt: new Date("2026-09-27T11:15:00Z"), completedAt: new Date("2026-09-27T10:00:00Z"), scheduledFor: new Date("2026-09-27T05:00:00Z") },
      { assigneeProfileId: 1, status: "completed", dueAt: new Date("2026-09-27T11:15:00Z"), completedAt: new Date("2026-09-28T05:00:00Z"), scheduledFor: new Date("2026-09-27T05:00:00Z") },
    ];
    const s = computeTaskPerformanceStats(rows).get(1)!;
    expect(s.total).toBe(2);
    expect(s.onTime).toBe(1);
    expect(Math.round((s.onTime / s.total) * 100)).toBe(50);
  });
});
