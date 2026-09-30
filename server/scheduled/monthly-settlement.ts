import { and, eq, gte } from "drizzle-orm";
import type { Request, Response } from "express";
import { attendanceRecords, monthlyBalances, notifications } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { isValidCronSecret } from "./cron-auth";
import { hijriMonthKey } from "../hijri-month";
import { recomputeMonthlyBalance } from "../court-service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** يشتغل يومياً: إذا كان اليوم آخر يوم في الشهر الهجري (أو أول يوم من الشهر التالي) يُجمَّع ويُقفل الرصيد. */
export async function runMonthlySettlement(now = new Date()) {
  const db = await getDb();
  if (!db) return { settled: 0, skipped: "database-unavailable" };

  const todayKey = hijriMonthKey(now);
  const yesterdayKey = hijriMonthKey(new Date(now.getTime() - DAY_MS));
  const tomorrowKey = hijriMonthKey(new Date(now.getTime() + DAY_MS));

  // الشهر المنتهي: أمس (لو اليوم أول يوم في الشهر الجديد) أو اليوم (لو اليوم آخر يوم في الشهر الحالي).
  let monthToSettle: string | null = null;
  if (yesterdayKey !== todayKey) monthToSettle = yesterdayKey;
  else if (tomorrowKey !== todayKey) monthToSettle = todayKey;
  if (!monthToSettle) return { settled: 0, skipped: "not-month-end" };

  // جمع الموظفين النشطين في الشهر المنتهي: من monthly_balances أو من attendance_records.
  const balanceRows = await db.select({ profileId: monthlyBalances.profileId }).from(monthlyBalances).where(eq(monthlyBalances.hijriMonthKey, monthToSettle));
  const since = new Date(now.getTime() - 35 * DAY_MS);
  const recordRows = await db.select({ profileId: attendanceRecords.profileId, recordDate: attendanceRecords.recordDate }).from(attendanceRecords).where(gte(attendanceRecords.recordDate, since));

  const profileIds = new Set<number>();
  for (const b of balanceRows) profileIds.add(b.profileId);
  for (const r of recordRows) if (hijriMonthKey(r.recordDate) === monthToSettle) profileIds.add(r.profileId);

  let settled = 0;
  for (const profileId of profileIds) {
    await recomputeMonthlyBalance(profileId, monthToSettle);
    await db.update(monthlyBalances).set({ isSettled: true, settledAt: now, updatedAt: now }).where(and(eq(monthlyBalances.profileId, profileId), eq(monthlyBalances.hijriMonthKey, monthToSettle)));
    await db.insert(notifications).values({
      profileId,
      category: "attendance_confirmation",
      title: "تم إقفال رصيد الشهر",
      body: `تم تجميع وإقفال رصيد شهر ${monthToSettle} تلقائياً.`,
      dedupeKey: `monthly-settled-${profileId}-${monthToSettle}`,
    }).onDuplicateKeyUpdate({ set: { title: "تم إقفال رصيد الشهر" } });
    settled += 1;
  }

  return { settled, monthToSettle, skipped: null };
}

export async function handleMonthlySettlementSchedule(req: Request, res: Response) {
  try {
    if (isValidCronSecret(req)) {
      const result = await runMonthlySettlement(new Date());
      return res.json({ ok: true, job: "monthly_settlement", ...result, via: "cron-secret" });
    }
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const result = await runMonthlySettlement(new Date());
    return res.json({ ok: true, job: "monthly_settlement", ...result, taskUid: user.taskUid });
  } catch (error) {
    return sendSafeScheduledFailure(res, { publicCode: "monthly-settlement-failed", job: "monthly_settlement", url: req.originalUrl, error });
  }
}