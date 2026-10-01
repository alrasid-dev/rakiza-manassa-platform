import type { Request, Response } from "express";
import { getDb } from "../db";
import { isValidCronSecret } from "./cron-auth";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { markOverdueTasks } from "../court-service";

export async function handleMarkOverdueTasksSchedule(req: Request, res: Response) {
  try {
    if (!isValidCronSecret(req)) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const result = await markOverdueTasks(new Date());
    return res.json({ ok: true, job: "mark-overdue-tasks", ...result, via: "cron-secret" });
  } catch (error) {
    return sendSafeScheduledFailure(res, { publicCode: "mark-overdue-tasks-failed", job: "mark-overdue-tasks", url: req.originalUrl, error });
  }
}
