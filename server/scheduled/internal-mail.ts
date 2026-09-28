import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { internalMailScheduleJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { dispatchRecurringInternalMail, dispatchScheduledInternalMail } from "../internal-mail-service";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { isValidCronSecret } from "./cron-auth";

export async function handleInternalMailSchedule(req: Request, res: Response) {
  try {
    if (isValidCronSecret(req)) {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "database-unavailable" });
      const [scheduled, recurring] = await Promise.all([dispatchScheduledInternalMail(), dispatchRecurringInternalMail()]);
      return res.json({ ok: true, via: "cron-secret", scheduled, recurring });
    }
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const job = (await db.select().from(internalMailScheduleJobs).where(eq(internalMailScheduleJobs.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
    if (!job || job.jobKey !== "internal-mail-dispatch") return res.json({ ok: true, skipped: "orphan-or-mismatch" });
    const [scheduled, recurring] = await Promise.all([dispatchScheduledInternalMail(), dispatchRecurringInternalMail()]);
    return res.json({ ok: true, taskUid: user.taskUid, scheduled, recurring });
  } catch (error) {
    return sendSafeScheduledFailure(res, { publicCode: "internal-mail-schedule-failed", job: "internal-mail-dispatch", url: req.originalUrl, error });
  }
}
