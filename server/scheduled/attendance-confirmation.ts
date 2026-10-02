import { and, desc, eq, exists, gte, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import type { Request, Response } from "express";
import { accessGrants, approvalRequests, attendanceRecords, confirmationAssignments, courtRoleAssignments, leaveRequests, notifications, personProfiles, scoreEvents, scheduledJobConfigs, systemConfigs, users, workShifts } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { sendSafeScheduledFailure } from "./safe-scheduled-failure";
import { isValidCronSecret } from "./cron-auth";
import { attendanceConfirmationCadence, attendanceConfirmationPolicyDefaults, shouldRequestAttendanceConfirmation, calculateComplianceRate, COMPLIANCE_EXEMPTION_THRESHOLD, COMPLIANCE_MANDATORY_THRESHOLD, EXEMPTION_WINDOW_DAYS, type AttendanceConfirmationCadence } from "../attendance-confirmation-policy";
import { dateRangeForSaudiDay, isSaudiWorkday } from "../task-automation";
import { isOfficialHoliday, workHoursFor } from "../holidays";
import { getCurrentAttendanceModes, MISSING_CHECKOUT_PENALTY_MINUTES, MISSING_CHECKOUT_PENALTY_POINTS } from "../court-service";
import { CONFIRMATION_RANDOM_END_MINUTES, CONFIRMATION_RANDOM_START_MINUTES, CONFIRMATION_WINDOW_MINUTES, confirmationCadence, shouldConfirmOnWorkday } from "../confirmation-cadence";
import { sendPushForNotification } from "../push-service";

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

  // نظام التأكيد الجديد (confirmation_assignments): توليد يومي عشوائي + إرسال + مساءلة + خصم نقاط.
  const generated = await generateConfirmationAssignments(now);
  const dispatched = await dispatchConfirmationAssignments(now);
  await runMissingCheckoutPenalty(now);
  return { scanned: generated, notified: dispatched.notified, skipped: 0, policy: "enabled", penalized: dispatched.missed };
}

/** يحسب عدد أيام عدم التأكيد خلال آخر 30 يوماً. */
async function countMissedConfirmationDays(profileId: number, now: Date): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db.select({ id: scoreEvents.id }).from(scoreEvents).where(and(eq(scoreEvents.profileId, profileId), eq(scoreEvents.reason, "عدم تأكيد بدء العمل خلال النافذة المحددة"), gte(scoreEvents.createdAt, since)));
  return rows.length;
}

/** خصم متدرج حسب تكرار عدم التأكيد: كل يومين → أسبوع → أسبوعين → شهر. */
async function calculatePenalty(profileId: number, now: Date): Promise<number> {
  const missedDays = await countMissedConfirmationDays(profileId, now);
  if (missedDays < 5) return -1;
  if (missedDays < 15) return -2;
  if (missedDays < 30) return -3;
  return -5;
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
      currentRole: "court_secretary",
      requestNote: `عدم تأكيد بدء العمل خلال ${policy.confirmationWindowMinutes} دقيقة (${dayRange.start.toISOString().slice(0, 10)})`,
    });

    await db.insert(scoreEvents).values({
      profileId,
      points: await calculatePenalty(profileId, now),
      reason: "عدم تأكيد بدء العمل خلال النافذة المحددة",
      createdByUserId: SYSTEM_ACTOR_ID,
    });

    if (profile.directManagerProfileId) {
      await db.insert(notifications).values({
        profileId: profile.directManagerProfileId,
        category: "disciplinary_team",
        title: "مساءلة تأكيد حضور",
        body: `${profile.fullName} لم يؤكد بدء العمل خلال ${policy.confirmationWindowMinutes} دقيقة.`,
        dedupeKey: `attendance-accountability-${profileId}-${dayRange.start.toISOString().slice(0, 10)}`,
      }).onDuplicateKeyUpdate({ set: { title: "مساءلة تأكيد حضور" } });
    }

    penalized += 1;
  }

  return { checked: earliestByProfile.size, penalized };
}

/**
 * عقوبة عدم تسجيل الانصراف: لأي موظف بصم دخولاً اليوم ولم يسجل انصرافاً،
 * بعد غلق البصمة تُطبَّق عقوبة فورية (-4 نقاط + خصم 240 دقيقة) مع مساءلة وإشعار.
 * الاستثناءات (لا تُطبَّق العقوبة إطلاقاً):
 * 1) الجمعة أو السبت. 2) الإجازات الرسمية. 3) لا يوجد بصمة دخول.
 * 4) إجازة معتمدة تغطي اليوم. 5) الوقت قبل غلق البصمة (14:59).
 * العملية idempotent: لن تُطبَّق العقوبة مرتين لنفس اليوم.
 */
export async function runMissingCheckoutPenalty(now = new Date()): Promise<{ checked: number; penalized: number }> {
  const db = await getDb();
  if (!db) return { checked: 0, penalized: 0 };

  // الشرط 1 و 2: ليس جمعة/سبت ولا إجازة رسمية.
  if (!isSaudiWorkday(now) || isOfficialHoliday(now)) {
    console.log("[missing-checkout] تخطي: يوم عطلة أو إجازة رسمية.");
    return { checked: 0, penalized: 0 };
  }

  // الشرط 5: الوقت بعد غلق البصمة (الافتراضي 14:59 = 899 دقيقة).
  const [shift] = await db
    .select({ fingerprintCloseMinutes: workShifts.fingerprintCloseMinutes, actualEndMinutes: workShifts.actualEndMinutes })
    .from(workShifts)
    .where(and(eq(workShifts.isDefault, true), eq(workShifts.isActive, true)))
    .limit(1);
  const closeMinutes = shift?.fingerprintCloseMinutes ?? 899;
  if (riyadhMinutesOfDay(now) <= closeMinutes) return { checked: 0, penalized: 0 };

  const dayRange = dateRangeForSaudiDay(now);

  // الشرط 3: يوجد بصمة دخول اليوم ولا يوجد بصمة انصراف.
  const records = await db
    .select()
    .from(attendanceRecords)
    .where(and(
      gte(attendanceRecords.recordDate, dayRange.start),
      lt(attendanceRecords.recordDate, dayRange.end),
      isNotNull(attendanceRecords.checkInAt),
      isNull(attendanceRecords.checkOutAt),
    ));

  const recordModes = await getCurrentAttendanceModes([...new Set(records.map(r => r.profileId))]);
  let penalized = 0;
  for (const record of records) {
    // الحالة الحالية للحضور: الموظف الحضوري لا يُطالَب بالانصراف.
    if ((recordModes.get(record.profileId) ?? "in_person") === "in_person") continue;
    // الشرط 4: لا توجد إجازة معتمدة تغطي اليوم.
    const approvedLeave = await db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.profileId, record.profileId),
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.startAt, dayRange.end),
        gte(leaveRequests.endAt, dayRange.start),
      ))
      .limit(1);
    if (approvedLeave[0]) {
      console.log(`[missing-checkout] تخطي ${record.profileId}: إجازة معتمدة تغطي اليوم.`);
      continue;
    }

    // تخطي الموظف الذي حالته "on_leave" (لا يُحاسب أثناء الإجازة).
    const onLeaveProfile = await db.select({ id: personProfiles.id }).from(personProfiles).where(and(eq(personProfiles.id, record.profileId), eq(personProfiles.status, "on_leave"))).limit(1);
    if (onLeaveProfile[0]) continue;

    // idempotent: لا تطبّق العقوبة مرتين.
    if (record.penaltyMinutes > 0) continue;

    // السلبي الكامل = المتوقع (نهاية الدوام 14:15 − دخول).
    const checkInMin = riyadhMinutesOfDay(record.checkInAt!);
    const expectedMinutes = Math.max(0, (shift?.actualEndMinutes ?? 855) - checkInMin);

    await db.update(attendanceRecords).set({
      penaltyMinutes: MISSING_CHECKOUT_PENALTY_MINUTES,
      negativeMinutes: expectedMinutes,
      compensationNote: "عقوبة: عدم تسجيل الانصراف → -4 نقاط + -240 دقيقة",
      updatedAt: new Date(),
    }).where(eq(attendanceRecords.id, record.id));

    await db.insert(scoreEvents).values({
      profileId: record.profileId,
      points: MISSING_CHECKOUT_PENALTY_POINTS,
      reason: "عقوبة: عدم تسجيل الانصراف",
      createdByUserId: 0,
    });

    await db.insert(approvalRequests).values({
      entityType: "disciplinary_action",
      entityId: record.profileId,
      requestedByUserId: 0,
      currentRole: "court_secretary",
      requestNote: "عقوبة: عدم تسجيل الانصراف → -4 نقاط + -240 دقيقة",
    });

    const dayKey = dayRange.start.toISOString().slice(0, 10);
    await db.insert(notifications).values({
      profileId: record.profileId,
      category: "disciplinary_employee",
      title: "لديك مساءلة جديدة — بانتظار ردك",
      body: "لم تسجل انصرافك اليوم، وطُبّقت عقوبة: -4 نقاط + خصم 240 دقيقة. يمكنك تقديم استئذان متأخر للمدير المباشر.",
      dedupeKey: `missing-checkout-${record.profileId}-${dayKey}`,
    }).onDuplicateKeyUpdate({ set: { title: "لديك مساءلة جديدة — بانتظار ردك" } });

    const profile = (await db
      .select({ fullName: personProfiles.fullName, directManagerProfileId: personProfiles.directManagerProfileId })
      .from(personProfiles)
      .where(eq(personProfiles.id, record.profileId))
      .limit(1))[0];
    if (profile?.directManagerProfileId) {
      await db.insert(notifications).values({
        profileId: profile.directManagerProfileId,
        category: "disciplinary_team",
        title: "مساءلة جديدة لموظف في قسمك",
        body: `${profile.fullName}: عقوبة عدم تسجيل الانصراف`,
        dedupeKey: `missing-checkout-manager-${record.profileId}-${dayKey}`,
      }).onDuplicateKeyUpdate({ set: { title: "مساءلة جديدة لموظف في قسمك" } });
      try { await sendPushForNotification(profile.directManagerProfileId, { title: "مساءلة جديدة لموظف في قسمك", body: `${profile.fullName}: عقوبة عدم تسجيل الانصراف`, url: "/disciplinary", tag: `missing-checkout-manager-${record.profileId}-${dayKey}` }); } catch (error) { console.warn("[WebPush] فشل إشعار مدير القسم بالمساءلة", { profileId: record.profileId, error }); }
    }

    penalized += 1;
  }

  return { checked: records.length, penalized };
}

function riyadhWeekday(now: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", weekday: "short" }).format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? -1;
}

/** الملفات الشخصية المستثناة من تأكيد الحضور (المالك/الرئيس/الأمين/القضاة). */
async function getExcludedProfileIds(): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const excluded = new Set<number>();
  const judges = await db.select({ id: personProfiles.id }).from(personProfiles).where(eq(personProfiles.personType, "judge"));
  judges.forEach(r => excluded.add(r.id));
  const admins = await db.select({ id: personProfiles.id }).from(personProfiles).innerJoin(users, eq(users.id, personProfiles.userId)).where(eq(users.role, "admin"));
  admins.forEach(r => excluded.add(r.id));
  const fullControl = await db.select({ id: personProfiles.id }).from(personProfiles).innerJoin(accessGrants, eq(accessGrants.userId, personProfiles.userId)).where(and(eq(accessGrants.permission, "full_control"), eq(accessGrants.isActive, true)));
  fullControl.forEach(r => excluded.add(r.id));
  const leaders = await db.select({ userId: courtRoleAssignments.userId }).from(courtRoleAssignments).where(and(eq(courtRoleAssignments.isActive, true), inArray(courtRoleAssignments.role, ["court_president", "court_secretary"])));
  const leaderUserIds = leaders.map(r => r.userId).filter((v): v is number => v != null);
  if (leaderUserIds.length) {
    const leaderProfiles = await db.select({ id: personProfiles.id }).from(personProfiles).where(inArray(personProfiles.userId, leaderUserIds));
    leaderProfiles.forEach(r => excluded.add(r.id));
  }
  const onLeave = await db.select({ id: personProfiles.id }).from(personProfiles).where(eq(personProfiles.status, "on_leave"));
  onLeave.forEach(r => excluded.add(r.id));
  return excluded;
}

async function getConfirmationSettings() {
  const db = await getDb();
  if (!db) return { globalEnabled: true, perDept: {} as Record<string, boolean>, audienceUnitIds: [] as number[] };
  const [row] = await db.select().from(systemConfigs).limit(1);
  return { globalEnabled: row?.confirmationEnabledGlobal ?? true, perDept: (row?.confirmationEnabledPerDept ?? {}) as Record<string, boolean>, audienceUnitIds: (row?.confirmationAudienceUnitIds ?? []) as number[] };
}

/** عدد أيام العمل المتواصلة المنجزة (done) — عند أي تخلف (missed) يتوقف العد. */
async function consecutiveDoneWorkdays(profileId: number, now: Date): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const since = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const rows = await db.select({ scheduledAt: confirmationAssignments.scheduledAt, status: confirmationAssignments.status }).from(confirmationAssignments).where(and(eq(confirmationAssignments.profileId, profileId), gte(confirmationAssignments.scheduledAt, since)));
  const byDay = new Map<string, { done: boolean; missed: boolean }>();
  for (const r of rows) {
    const key = r.scheduledAt.toISOString().slice(0, 10);
    const cur = byDay.get(key) ?? { done: false, missed: false };
    if (r.status === "done") cur.done = true;
    if (r.status === "missed") cur.missed = true;
    byDay.set(key, cur);
  }
  let count = 0;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  for (let i = 1; i <= 45; i++) {
    const cursor = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const day = byDay.get(cursor.toISOString().slice(0, 10));
    if (!day || day.missed || !day.done) break;
    count += 1;
  }
  return count;
}

/** أيام منذ آخر تأكيد ناجح (done) — لاستخدامها في "مرة كل 15 يوم". */
async function daysSinceLastDoneFor(profileId: number, now: Date): Promise<number> {
  const db = await getDb();
  if (!db) return 999;
  const since = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const rows = await db.select({ scheduledAt: confirmationAssignments.scheduledAt }).from(confirmationAssignments).where(and(eq(confirmationAssignments.profileId, profileId), eq(confirmationAssignments.status, "done"), gte(confirmationAssignments.scheduledAt, since))).orderBy(desc(confirmationAssignments.scheduledAt)).limit(1);
  if (!rows[0]) return 999;
  return Math.floor((now.getTime() - rows[0].scheduledAt.getTime()) / (24 * 60 * 60 * 1000));
}

/** توليد تكليفات تأكيد الحضور اليومية (مرة واحدة) بوقت عشوائي لكل مستحق. */
export async function generateConfirmationAssignments(now = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (!isSaudiWorkday(now) || isOfficialHoliday(now)) return 0;
  const settings = await getConfirmationSettings();
  if (!settings.globalEnabled) return 0;

  const dayRange = dateRangeForSaudiDay(now);
  const existing = await db.select({ id: confirmationAssignments.id }).from(confirmationAssignments).where(and(gte(confirmationAssignments.scheduledAt, dayRange.start), lt(confirmationAssignments.scheduledAt, dayRange.end))).limit(1);
  if (existing[0]) return 0;

  const excluded = await getExcludedProfileIds();
  const weekday = riyadhWeekday(now);
  const profiles = await db.select().from(personProfiles).where(and(
    eq(personProfiles.status, "active"),
    exists(db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.profileId, personProfiles.id), isNotNull(attendanceRecords.checkInAt)))),
  ));
  const allowlist = settings.audienceUnitIds?.length ? new Set(settings.audienceUnitIds) : null;
  const currentModes = await getCurrentAttendanceModes(profiles.map(p => p.id), now);

  let generated = 0;
  for (const profile of profiles) {
    if (excluded.has(profile.id)) continue;
    if ((currentModes.get(profile.id) ?? "in_person") === "in_person") continue;
    if (allowlist) {
      if (profile.unitId == null || !allowlist.has(profile.unitId)) continue;
    } else if (profile.unitId != null && settings.perDept[String(profile.unitId)] === false) {
      continue;
    }
    const consecutive = await consecutiveDoneWorkdays(profile.id, now);
    const cadence = confirmationCadence(consecutive);
    const daysSinceLastDone = await daysSinceLastDoneFor(profile.id, now);
    if (!shouldConfirmOnWorkday(cadence, weekday, daysSinceLastDone)) continue;
    const minutes = CONFIRMATION_RANDOM_START_MINUTES + Math.floor(Math.random() * (CONFIRMATION_RANDOM_END_MINUTES - CONFIRMATION_RANDOM_START_MINUTES));
    const scheduledAt = new Date(dayRange.start.getTime() + minutes * 60000);
    await db.insert(confirmationAssignments).values({ profileId: profile.id, scheduledAt, status: "pending" });
    generated += 1;
  }
  return generated;
}

/** إرسال إشعارات التكليفات المستحقة + تحويل المتخلفين إلى missed مع مساءلة وخصم نقطة. */
export async function dispatchConfirmationAssignments(now = new Date()): Promise<{ notified: number; missed: number }> {
  const db = await getDb();
  if (!db) return { notified: 0, missed: 0 };
  const settings = await getConfirmationSettings();
  if (!settings.globalEnabled) return { notified: 0, missed: 0 };

  const due = await db.select().from(confirmationAssignments).where(and(eq(confirmationAssignments.status, "pending"), lte(confirmationAssignments.scheduledAt, now)));

  let notified = 0;
  let missed = 0;
  for (const assignment of due) {
    const deadline = new Date(assignment.scheduledAt.getTime() + CONFIRMATION_WINDOW_MINUTES * 60000);
    if (now > deadline) {
      await db.update(confirmationAssignments).set({ status: "missed" }).where(eq(confirmationAssignments.id, assignment.id));
      await db.insert(scoreEvents).values({ profileId: assignment.profileId, points: -1, reason: "التخلف عن تأكيد الحضور", createdByUserId: SYSTEM_ACTOR_ID });
      await db.insert(approvalRequests).values({ entityType: "disciplinary_action", entityId: assignment.profileId, requestedByUserId: SYSTEM_ACTOR_ID, currentRole: "court_secretary", requestNote: "التخلف عن تأكيد الحضور خلال النافذة المحددة" });
      const missedProfile = (await db.select({ fullName: personProfiles.fullName, directManagerProfileId: personProfiles.directManagerProfileId }).from(personProfiles).where(eq(personProfiles.id, assignment.profileId)).limit(1))[0];
      if (missedProfile?.directManagerProfileId) {
        await db.insert(notifications).values({ profileId: missedProfile.directManagerProfileId, category: "disciplinary_team", title: "مساءلة جديدة لموظف في قسمك", body: `${missedProfile.fullName}: تخلف عن تأكيد الحضور خلال النافذة المحددة`, dedupeKey: `confirmation-missed-manager-${assignment.id}` }).onDuplicateKeyUpdate({ set: { title: "مساءلة جديدة لموظف في قسمك" } });
        try { await sendPushForNotification(missedProfile.directManagerProfileId, { title: "مساءلة جديدة لموظف في قسمك", body: `${missedProfile.fullName}: تخلف عن تأكيد الحضور`, url: "/disciplinary", tag: `confirmation-missed-manager-${assignment.id}` }); } catch (error) { console.warn("[WebPush] فشل إشعار مدير القسم بمساءلة تخلف التأكيد", { assignmentId: assignment.id, error }); }
      }
      await db.insert(notifications).values({ profileId: assignment.profileId, category: "attendance_confirmation", title: "فاتتك نافذة تأكيد الحضور", body: "انتهت نافذة تأكيد الحضور دون تأكيد، وسُجّلت مساءلة.", dedupeKey: `confirmation-missed-${assignment.id}` }).onDuplicateKeyUpdate({ set: { title: "فاتتك نافذة تأكيد الحضور" } });
      try { await sendPushForNotification(assignment.profileId, { title: "فاتتك نافذة تأكيد الحضور", body: "انتهت نافذة تأكيد الحضور دون تأكيد، وسُجّلت مساءلة.", url: "/disciplinary", tag: `confirmation-missed-${assignment.id}` }); } catch (error) { console.warn("[WebPush] فشل إرسال إشعار تخلف تأكيد الحضور", { assignmentId: assignment.id, error }); }
      missed += 1;
    } else {
      const result = await db.insert(notifications).values({ profileId: assignment.profileId, category: "attendance_confirmation", title: "تأكيد الحضور", body: "يرجى تأكيد حضورك الآن.", dedupeKey: `confirmation-request-${assignment.id}` }).onDuplicateKeyUpdate({ set: { title: "تأكيد الحضور" } });
      try { await sendPushForNotification(assignment.profileId, { title: "تأكيد الحضور", body: "يرجى تأكيد حضورك الآن خلال 20 دقيقة.", url: "/status", tag: `confirmation-request-${assignment.id}` }); } catch (error) { console.warn("[WebPush] فشل إرسال إشعار تأكيد الحضور", { assignmentId: assignment.id, error }); }
      if (Number(result[0].affectedRows) === 1) notified += 1;
    }
  }
  return { notified, missed };
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
