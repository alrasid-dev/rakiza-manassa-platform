import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { scheduledJobConfigs } from "../../drizzle/schema";
import { activateScheduledLeaveStatuses, createRecurringTasksAndNotifications, escalateOverdueSupportTickets, escalateOverdueTasks, scanLinkedTraineeExcelSource } from "../court-service";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { runAttendanceConfirmationCycle, type AttendanceAudience } from "./attendance-confirmation";
import { isValidCronSecret } from "./cron-auth";

type AutomatedJob = "daily_task_reminder" | "task_escalation" | "leave_status_refresh" | "trainee_excel_sync" | "support_ticket_escalation" | "attendance_confirmation";

type AutomationConfig = {
  attendanceTargetProfileId?: number | null;
  attendanceTargetAudience?: string;
};

async function runAutomatedJob(expectedJob: AutomatedJob, config?: AutomationConfig) {
  if (expectedJob === "daily_task_reminder") return createRecurringTasksAndNotifications();
  if (expectedJob === "task_escalation") return escalateOverdueTasks();
  if (expectedJob === "trainee_excel_sync") return scanLinkedTraineeExcelSource();
  if (expectedJob === "support_ticket_escalation") return escalateOverdueSupportTickets();
  if (expectedJob === "attendance_confirmation") {
    return runAttendanceConfirmationCycle(
      undefined,
      config?.attendanceTargetProfileId ?? null,
      (config?.attendanceTargetAudience ?? "all") as AttendanceAudience
    );
  }
  return activateScheduledLeaveStatuses();
}

export function createTaskAutomationHandler(expectedJob: AutomatedJob) {
  return async (req: Request, res: Response) => {
    try {
      // مسار GitHub Actions: تحقق عبر x-cron-secret وتشغيل مباشر (بدون taskUid).
      if (isValidCronSecret(req)) {
        const db = await getDb();
        if (!db) return res.status(503).json({ error: "database-unavailable" });
        const result = await runAutomatedJob(expectedJob);
        return res.json({ ok: true, job: expectedJob, ...result, via: "cron-secret" });
      }

      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "database-unavailable" });
      const config = (await db.select().from(scheduledJobConfigs).where(eq(scheduledJobConfigs.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
      if (!config) return res.json({ ok: true, skipped: "orphan" });
      if (!config.isActive || config.jobType !== expectedJob) return res.json({ ok: true, skipped: "disabled-or-mismatch" });
      const result = await runAutomatedJob(expectedJob, { attendanceTargetProfileId: config.attendanceTargetProfileId ?? null, attendanceTargetAudience: config.attendanceTargetAudience ?? "all" });
      return res.json({ ok: true, job: expectedJob, ...result, taskUid: user.taskUid });
    } catch (error) {
      return sendSafeScheduledFailure(res, { publicCode: "task-automation-failed", job: expectedJob, url: req.originalUrl, error });
    }
  };
}

export const handleDailyTaskReminderSchedule = createTaskAutomationHandler("daily_task_reminder");
export const handleTaskEscalationSchedule = createTaskAutomationHandler("task_escalation");
export const handleLeaveStatusRefreshSchedule = createTaskAutomationHandler("leave_status_refresh");
export const handleTraineeExcelSyncSchedule = createTaskAutomationHandler("trainee_excel_sync");
export const handleSupportTicketEscalationSchedule = createTaskAutomationHandler("support_ticket_escalation");
