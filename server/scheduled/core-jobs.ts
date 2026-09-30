import { and, eq, isNull } from "drizzle-orm";
import { parse as parseCookie } from "cookie";
import { scheduledJobConfigs } from "../../drizzle/schema";
import { getDb } from "../db";
import { createHeartbeatJob } from "../_core/heartbeat";

const CORE_JOBS = [
  { jobType: "daily_task_reminder" as const, cronExpression: "0 0 4 * * 0-4", path: "/api/scheduled/daily-task-reminder", description: "تذكير المهام اليومية في بداية يوم العمل" },
  { jobType: "task_escalation" as const, cronExpression: "0 */15 4-12 * * 0-4", path: "/api/scheduled/task-escalation", description: "فحص التصعيدات كل 15 دقيقة أثناء وقت العمل" },
  { jobType: "trainee_due_soon" as const, cronExpression: "0 0 3 * * *", path: "/api/scheduled/trainee-due-soon", description: "تنبيه الملازمين قبل انتهاء الملازمة بسبعة أيام" },
  { jobType: "leave_status_refresh" as const, cronExpression: "0 0 * * * *", path: "/api/scheduled/leave-status-refresh", description: "تحديث حالات الإجازات آلياً" },
  { jobType: "trainee_excel_sync" as const, cronExpression: "0 */30 4-12 * * 0-4", path: "/api/scheduled/trainee-excel-sync", description: "مزامنة مصدر Excel كل 30 دقيقة أثناء وقت العمل" },
  { jobType: "support_ticket_escalation" as const, cronExpression: "0 0 * * * *", path: "/api/scheduled/support-ticket-escalation", description: "فحص تصعيد تذاكر الدعم كل ساعة" },
  { jobType: "attendance_confirmation" as const, cronExpression: "0 0 4-12 * * 0-4", path: "/api/scheduled/attendance-confirmation", description: "إرسال طلبات تأكيد الحضور للعاملين عن بعد خلال وقت العمل" },
  { jobType: "monthly_settlement" as const, cronExpression: "0 0 3 * * *", path: "/api/scheduled/monthly-settlement", description: "تجميع وإقفال أرصدة الشهر الهجري المنتهي" },
] as const;

export async function ensureAttendanceConfirmationHeartbeatJob(input: { userSession: string }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const job = CORE_JOBS.find(item => item.jobType === "attendance_confirmation")!;
  const [config] = await db.select().from(scheduledJobConfigs).where(eq(scheduledJobConfigs.jobType, job.jobType)).limit(1);
  if (config?.scheduleCronTaskUid) return { taskUid: config.scheduleCronTaskUid, cronExpression: config.cronExpression, created: false };
  const heartbeat = await createHeartbeatJob({ name: `rakiza-${job.jobType}`, cron: job.cronExpression, path: job.path, description: job.description }, input.userSession);
  if (config) {
    await db.update(scheduledJobConfigs).set({ scheduleCronTaskUid: heartbeat.taskUid, isActive: true, updatedAt: new Date() }).where(eq(scheduledJobConfigs.id, config.id));
  } else {
    await db.insert(scheduledJobConfigs).values({ jobType: job.jobType, scheduleCronTaskUid: heartbeat.taskUid, cronExpression: job.cronExpression, isActive: true });
  }
  return { taskUid: heartbeat.taskUid, cronExpression: job.cronExpression, created: true };
}

export async function ensureCoreHeartbeatJobs(input: { userSession: string }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const result: Array<{ jobType: string; taskUid: string; cronExpression: string; created: boolean }> = [];
  for (const job of CORE_JOBS) {
    const [config] = await db.select().from(scheduledJobConfigs).where(eq(scheduledJobConfigs.jobType, job.jobType)).limit(1);
    if (config?.scheduleCronTaskUid) {
      result.push({ jobType: job.jobType, taskUid: config.scheduleCronTaskUid, cronExpression: config.cronExpression, created: false });
      continue;
    }
    const heartbeat = await createHeartbeatJob({ name: `rakiza-${job.jobType}`, cron: job.cronExpression, path: job.path, description: job.description }, input.userSession);
    if (config) {
      await db.update(scheduledJobConfigs).set({ scheduleCronTaskUid: heartbeat.taskUid, isActive: true, updatedAt: new Date() }).where(eq(scheduledJobConfigs.id, config.id));
    } else {
      await db.insert(scheduledJobConfigs).values({ jobType: job.jobType, scheduleCronTaskUid: heartbeat.taskUid, cronExpression: job.cronExpression, isActive: true });
    }
    result.push({ jobType: job.jobType, taskUid: heartbeat.taskUid, cronExpression: job.cronExpression, created: true });
  }
  return result;
}

export { CORE_JOBS };
