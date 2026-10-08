import { describe, expect, it } from "vitest";
import { CORE_JOBS } from "./core-jobs";

describe("وظائف Heartbeat الأساسية", () => {
  it("تغطي التنبيهات والتصعيد والمزامنة وحالات الإجازة والدعم", () => {
    expect(CORE_JOBS).toHaveLength(8);
    for (const job of CORE_JOBS) {
      expect(job.path).toMatch(/^\/api\/scheduled\//);
      expect(job.cronExpression.trim().split(/\s+/)).toHaveLength(6);
      expect(job.description.length).toBeGreaterThan(10);
    }
  });

  it("يخفف الجدولة إلى مرة يومياً للتصعيد والمزامنة وحالات الإجازة والدعم", () => {
    expect(CORE_JOBS.find(job => job.jobType === "daily_task_reminder")?.cronExpression).toBe("0 0 4 * * 0-4");
    expect(CORE_JOBS.find(job => job.jobType === "trainee_due_soon")?.cronExpression).toBe("0 0 3 * * *");
    expect(CORE_JOBS.find(job => job.jobType === "task_escalation")?.cronExpression).toBe("0 0 8 * * 0-4");
    expect(CORE_JOBS.find(job => job.jobType === "trainee_excel_sync")?.cronExpression).toBe("0 15 8 * * 0-4");
    expect(CORE_JOBS.find(job => job.jobType === "leave_status_refresh")?.cronExpression).toBe("0 30 0 * * *");
    expect(CORE_JOBS.find(job => job.jobType === "support_ticket_escalation")?.cronExpression).toBe("0 45 0 * * *");
    expect(CORE_JOBS.find(job => job.jobType === "attendance_confirmation")?.cronExpression).toBe("0 0 7 * * 0-4");
  });
});
