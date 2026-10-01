import type { Request, Response } from "express";
import { getDb } from "../db";
import { isValidCronSecret } from "./cron-auth";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { autoResumeExpiredPausedTasks, checkExpiringPauses } from "../court-service";

export async function handleAutoResumeTasksSchedule(req: Request, res: Response) {
  try {
    if (!isValidCronSecret(req)) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const now = new Date();
    const result = await autoResumeExpiredPausedTasks(now);
    const warning = await checkExpiringPauses(now);
    return res.json({ ok: true, job: "auto-resume-tasks", ...result, ...warning, via: "cron-secret" });
  } catch (error) {
    return sendSafeScheduledFailure(res, { publicCode: "auto-resume-tasks-failed", job: "auto-resume-tasks", url: req.originalUrl, error });
  }
}
