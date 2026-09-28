import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { scheduledJobConfigs } from "../../drizzle/schema";
import { createDueSoonNotifications } from "../court-service";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { isValidCronSecret } from "./cron-auth";

export async function handleTraineeDueSoonSchedule(req: Request, res: Response) {
  try {
    if (isValidCronSecret(req)) {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "database-unavailable" });
      const result = await createDueSoonNotifications();
      return res.json({ ok: true, ...result, via: "cron-secret" });
    }
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const config = (await db.select().from(scheduledJobConfigs).where(eq(scheduledJobConfigs.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
    if (!config) return res.json({ ok: true, skipped: "orphan" });
    if (!config.isActive) return res.json({ ok: true, skipped: "disabled" });
    const result = await createDueSoonNotifications();
    return res.json({ ok: true, ...result, taskUid: user.taskUid });
  } catch (error) {
    return sendSafeScheduledFailure(res, { publicCode: "trainee-due-soon-failed", job: "trainee_due_soon", url: req.originalUrl, error });
  }
}
