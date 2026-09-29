import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import type { Request, Response } from "express";
import { approvalRequests, attendanceRecords, notifications, personProfiles, scoreEvents, scheduledJobConfigs } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { isValidCronSecret } from "./cron-auth";
import { attendanceConfirmationCadence, attendanceConfirmationPolicyDefaults, shouldRequestAttendanceConfirmation, calculateComplianceRate, COMPLIANCE_EXEMPTION_THRESHOLD, COMPLIANCE_MANDATORY_THRESHOLD, EXEMPTION_WINDOW_DAYS, type AttendanceConfirmationCadence } from "../attendance-confirmation-policy";
import { dateRangeForSaudiDay, isSaudiWorkday } from "../task-automation";
import { isOfficialHoliday, workHoursFor } from "../holidays";

const ACTIVE_REMOTE_MODES = ["remote", "mixed"] as const;
const SYSTEM_ACTOR_ID = 0;

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function riyadhMinutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const field = (name: string) => Number(parts.find(p => p.type === name)?.value || "0");
  return field("hour") * 60 + field("minute");
}

export type AttendanceAudience = "employees" | "trainees" | "judges" | "all" | "employees,trainees" | "employees,judges" | "trainees,judges" | "employees,trainees,judges";

type AttendanceCycleResult = {
  scanned: number;
  notified: number;
  skipped: number;
  policy: "enabled";
  penalized: number;
};

export async function runAttendanceConfirmationCycle(now = new Date(), targetProfileId?: number | null, audience: AttendanceAudience = "all"): Promise<AttendanceCycleResult> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  // لا تعمل قبل بداية ساعات العمل الرسمية + فترة سماح 15 دقيقة، ولا في العطل.
  if (!isSaudiWorkday(now) || isOfficialHoliday(now)) return { scanned: 0, notified: 0, skipped: 0, policy: "enabled", penalized: 0 };
  if (riyadhMinutesOfDay(now) < parseTimeToMinutes(workHoursFor(now).start) + 15) return { scanned: 0, notified: 0, skipped: 0, policy: "enabled", penalized: 0 };

  const selectedAudiences = audience === "all" || audience === "employees,trainees,judges" ? ["employees", "trainees", "judges"] : audience.split(",");
  const audienceFilter = selectedAudiences.length === 3 ? undefined : or(...selectedAudiences.map(selected => selected === "employees" ? eq(personProfiles.personType, "administrative") : selected === "trainees" ? eq(personProfiles.personType, "trainee") : eq(personProfiles.personType, "judge")));
  const profileFilters = [eq(personProfiles.status, "active"), or(eq(personProfiles.attendanceMode, ACTIVE_REMOTE_MODES[0]), eq(personProfiles.attendanceMode, ACTIVE_REMOTE_MODES[1])), ...(audienceFilter ? [audienceFilter] : [])];
  if (targetProfileId !== undefined && targetProfileId !== null) profileFilters.push(eq(personProfiles.id, targetProfileId));
  const profiles = await db.select().from(personProfiles).where(and(...profileFilters));
  const recentRequests = await db
    .select({ profileId: notifications.profileId, sentAt: notifications.sentAt })
    .from(notifications)
    .where(eq(notifications.category, "attendance_confirmation"))
    .orderBy(desc(notifications.sentAt));
  const lastRequestedByProfile = new Map<number, Date>();
  for (const request of recentRequests) {
    if (request.profileId != null && !lastRequestedByProfile.has(request.profileId)) lastRequestedByProfile.set(request.profileId, request.sentAt);
  }

  let notified = 0;
  let skipped = 0;
  for (const profile of profiles) {
    const lastRequestedAt = lastRequestedByProfile.get(profile.id) ?? null;
    const recentAttendance = await db
      .select({ status: attendanceRecords.status, recordDate: attendanceRecords.recordDate })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.profileId, profile.id))
      .orderBy(desc(attendanceRecords.recordDate));
    const confirmedDays = recentAttendance.filter(record => record.status === "present" || record.status === "late").slice(0, 30).length;
    const complianceRate = calculateComplianceRate(confirmedDays, 30);

    // الإعفاء الذكي: المنضبط (≥90%) يُعفى من التأكيد لمدة 7 أيام.
    if (complianceRate >= COMPLIANCE_EXEMPTION_THRESHOLD) {
      const lastExemption = profile.lastConfirmExemptionAt;
      if (lastExemption && now.getTime() - lastExemption.getTime() < EXEMPTION_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
        skipped += 1;
        continue;
      }
      await db.update(personProfiles).set({ lastConfirmExemptionAt: now }).where(eq(personProfiles.id, profile.id));
      skipped += 1;
      continue;
    }

    // غير المنضبط (<50%) يُلزم بتأكيد يومي إجباري.
    const cadence: AttendanceConfirmationCadence | "disabled" = complianceRate < COMPLIANCE_MANDATORY_THRESHOLD
      ? "daily"
      : attendanceConfirmationCadence({ enabled: true, consecutiveConfirmedDays: confirmedDays, ignoredRecentConfirmations: 0 });

    if (!shouldRequestAttendanceConfirmation({ enabled: true, lastRequestedAt, now, cadence })) {
      skipped += 1;
      continue;
    }
    const dayKey = now.toISOString().slice(0, 10);
    const dedupeKey = `attendance-confirmation-${profile.id}-${dayKey}`;
    const result = await db.insert(notifications).values({
      profileId: profile.id,
      category: "attendance_confirmation",
      title: "تأكيد بدء العمل",
      body: "يرجى تأكيد بدء العمل خلال 20 دقيقة من استلام هذا التنبيه. إذا تعذر التأكيد، أضف سبباً من شاشة الحضور.",
      dedupeKey,
    });
    if (Number(result[0].affectedRows) === 1) notified += 1;
  }
  const accountability = await runAttendanceAccountabilityCycle(now);
  return { scanned: profiles.length, notified, skipped, policy: "enabled", penalized: accountability.penalized };
}

/**
 * مساءلة عدم تأكيد الحضور (المسار الثاني من السياسة): لأي موظف عن بُعد استلم
 * تنبيهاً لتأكيد بدء العمل اليوم وتجاوزت نافذة التأكيد، إن لم يسجل حضوره
 * تُنشأ مساءلة مباشرة، ويُخصم منه نقطة مؤشر الالتزام، وتُرسل نسخة لمديره المباشر.
 * العملية idempotent: لن تُنشأ مساءلة مكررة لنفس اليوم.
 */
export async function runAttendanceAccountabilityCycle(now = new Date()): Promise<{ checked: number; penalized: number }> {
  const db = await getDb();
  if (!db) return { checked: 0, penalized: 0 };

  const policy = attendanceConfirmationPolicyDefaults();
  const dayRange = dateRangeForSaudiDay(now);
  const deadlineMs = policy.confirmationWindowMinutes * 60 * 1000;

  const sentRows = await db
    .select({ profileId: notifications.profileId, sentAt: notifications.sentAt })
    .from(notifications)
    .where(and(eq(notifications.category, "attendance_confirmation"), gte(notifications.sentAt, dayRange.start), lt(notifications.sentAt, dayRange.end)));

  const earliestByProfile = new Map<number, Date>();
  for (const row of sentRows) {
    if (row.profileId == null) continue;
    const previous = earliestByProfile.get(row.profileId);
    if (!previous || row.sentAt < previous) earliestByProfile.set(row.profileId, row.sentAt);
  }

  let penalized = 0;
  for (const [profileId, sentAt] of earliestByProfile) {
    if (sentAt.getTime() + deadlineMs > now.getTime()) continue;

    const confirmed = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.profileId, profileId), gte(attendanceRecords.recordDate, dayRange.start), lt(attendanceRecords.recordDate, dayRange.end), inArray(attendanceRecords.status, ["present", "late"])))
      .limit(1);
    if (confirmed[0]) continue;

    const existingDiscipline = await db
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.entityType, "disciplinary_action"), eq(approvalRequests.entityId, profileId), eq(approvalRequests.status, "pending"), gte(approvalRequests.createdAt, dayRange.start)))
      .limit(1);
    if (existingDiscipline[0]) continue;

    const profile = (await db
      .select({ fullName: personProfiles.fullName, directManagerProfileId: personProfiles.directManagerProfileId })
      .from(personProfiles)
      .where(eq(personProfiles.id, profileId))
      .limit(1))[0];
    if (!profile) continue;

    await db.insert(approvalRequests).values({
      entityType: "disciplinary_action",
      entityId: profileId,
      requestedByUserId: SYSTEM_ACTOR_ID,
      currentRole: "human_resources_manager",
      requestNote: `عدم تأكيد بدء العمل خلال ${policy.confirmationWindowMinutes} دقيقة (${dayRange.start.toISOString().slice(0, 10)})`,
    });

    await db.insert(scoreEvents).values({
      profileId,
      points: policy.ignoredConfirmationPenalty,
      reason: "عدم تأكيد بدء العمل خلال النافذة المحددة",
      createdByUserId: SYSTEM_ACTOR_ID,
    });

    if (profile.directManagerProfileId) {
      await db.insert(notifications).values({
        profileId: profile.directManagerProfileId,
        category: "security_alert",
        title: "مساءلة تأكيد حضور",
        body: `${profile.fullName} لم يؤكد بدء العمل خلال ${policy.confirmationWindowMinutes} دقيقة.`,
        dedupeKey: `attendance-accountability-${profileId}-${dayRange.start.toISOString().slice(0, 10)}`,
      }).onDuplicateKeyUpdate({ set: { title: "مساءلة تأكيد حضور" } });
    }

    penalized += 1;
  }

  return { checked: earliestByProfile.size, penalized };
}

function nowForAttendanceCycle() {
  return new Date();
}

export async function handleAttendanceConfirmationSchedule(req: Request, res: Response) {
  try {
    if (isValidCronSecret(req)) {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "database-unavailable" });
      const result = await runAttendanceConfirmationCycle(nowForAttendanceCycle(), null, "all");
      return res.json({ ok: true, job: "attendance_confirmation", ...result, via: "cron-secret" });
    }
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const config = (await db.select().from(scheduledJobConfigs).where(eq(scheduledJobConfigs.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
    if (!config) return res.json({ ok: true, skipped: "orphan" });
    if (!config.isActive || config.jobType !== "attendance_confirmation") return res.json({ ok: true, skipped: "disabled-or-mismatch" });
    const result = await runAttendanceConfirmationCycle(nowForAttendanceCycle(), config.attendanceTargetProfileId, (config.attendanceTargetAudience as AttendanceAudience) || "all");
    return res.json({ ok: true, job: "attendance_confirmation", ...result, targetProfileId: config.attendanceTargetProfileId ?? null, taskUid: user.taskUid });
  } catch (error) {
    return sendSafeScheduledFailure(res, { publicCode: "attendance-confirmation-failed", job: "attendance_confirmation", url: req.originalUrl, error });
  }
}
