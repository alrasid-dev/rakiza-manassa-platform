import type { Request, Response } from "express";
import { getDb } from "../db";
import { isValidCronSecret } from "./cron-auth";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { returnExpiredReassignments } from "../court-service";

export async function handleTaskReassignmentReturnSchedule(req: Request, res: Response) {
  try {
    if (!isValidCronSecret(req)) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const result = await returnExpiredReassignments();
    return res.json({ ok: true, job: "task-reassignment-return", ...result, via: "cron-secret" });
  } catch (error) {
    return sendSafeScheduledFailure(res, { publicCode: "task-reassignment-return-failed", job: "task-reassignment-return", url: req.originalUrl, error });
  }
}
