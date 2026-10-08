import { describe, expect, it } from "vitest";
import { CORE_JOBS } from "./scheduled/core-jobs";
import { attendanceConfirmationCadence, attendanceConfirmationDeadline, shouldRequestAttendanceConfirmation } from "./attendance-confirmation-policy";

describe("وظيفة Heartbeat لتأكيد الحضور", () => {
  it("تسجل مساراً مصادقاً عليه خلال ساعات العمل دون تفعيل تلقائي", () => {
    const job = CORE_JOBS.find(item => item.jobType === "attendance_confirmation");
    expect(job).toMatchObject({
      path: "/api/scheduled/attendance-confirmation",
      cronExpression: "0 0 7 * * 0-4",
    });
  });

  it("تحترم التدرج ونافذة العشرين دقيقة", () => {
    expect(attendanceConfirmationCadence({ enabled: true, consecutiveConfirmedDays: 0, ignoredRecentConfirmations: 0 })).toBe("every_two_days");
    expect(attendanceConfirmationCadence({ enabled: true, consecutiveConfirmedDays: 40, ignoredRecentConfirmations: 0 })).toBe("monthly");
    const start = new Date("2026-08-20T07:00:00Z");
    expect(attendanceConfirmationDeadline(start).toISOString()).toBe("2026-08-20T07:20:00.000Z");
    expect(shouldRequestAttendanceConfirmation({ enabled: true, lastRequestedAt: start, now: new Date("2026-08-21T07:00:00Z"), cadence: "every_two_days" })).toBe(false);
  });
});
