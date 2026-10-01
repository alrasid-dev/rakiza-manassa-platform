import type { Request, Response } from "express";
import { getDb } from "../db";
import { isValidCronSecret } from "./cron-auth";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { isSaudiWorkday } from "../task-automation";
import { isOfficialHoliday } from "../holidays";
import { runSmartNotificationsCycle } from "../smart-notifications";

/** آخر وقت يُسمح فيه بتشغيل دورة الإشعارات الذكية: بعد 14:59 (نهاية الدوام). */
const SMART_START_MINUTES = 14 * 60 + 59;

function riyadhMinutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const field = (name: string) => Number(parts.find(p => p.type === name)?.value || "0");
  return field("hour") * 60 + field("minute");
}

export async function handleSmartNotificationsSchedule(req: Request, res: Response) {
  try {
    if (!isValidCronSecret(req)) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });

    const now = new Date();
    if (!isSaudiWorkday(now) || isOfficialHoliday(now)) return res.json({ ok: true, job: "smart-notifications", skipped: "non-workday" });
    if (riyadhMinutesOfDay(now) < SMART_START_MINUTES) return res.json({ ok: true, job: "smart-notifications", skipped: "before-end-of-day" });

    const result = await runSmartNotificationsCycle(now);
    return res.json({ ok: true, job: "smart-notifications", ...result, via: "cron-secret" });
  } catch (error) {
    return sendSafeScheduledFailure(res, { publicCode: "smart-notifications-failed", job: "smart-notifications", url: req.originalUrl, error });
  }
}
