// server/smart-notifications.ts
// الإشعارات الذكية للمالك (دورية): أنماط غياب / بصمة دخول بدون خروج / تأخر مزمن / مهام متأخرة.
// تختلف عن الأحداث الأمنية الفورية (attendance.record_attempt_failed / court_role.assigned).

import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, notInArray } from "drizzle-orm";
import { attendanceRecords, leaveRequests, notifications, personProfiles, tasks, users } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { dateRangeForSaudiDay, isSaudiWorkday } from "./task-automation";
import { isOfficialHoliday } from "./holidays";
import { getCurrentAttendanceModes, sendBrevoTransactionalEmail } from "./court-service";

export type SmartNotificationType = "absent" | "urgent_absent" | "missing_checkout" | "chronic_late" | "late_task";

export type SmartFinding = { profileId: number; fullName: string; type: SmartNotificationType; days: number; detail?: string };

function saudiDayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** آخر `count` أيام عمل سعودية (تجاهل الجمعة/السبت/الإجازات)، الأحدث أولاً. */
function recentSaudiWorkdays(now: Date, count: number): Date[] {
  const starts: Date[] = [];
  let cursor = new Date(now);
  for (let guard = 0; starts.length < count && guard < 60; guard += 1) {
    if (isSaudiWorkday(cursor) && !isOfficialHoliday(cursor)) {
      starts.push(dateRangeForSaudiDay(cursor).start);
    }
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return starts;
}

async function activeAdministrativeProfiles() {
  const db = await getDb();
  if (!db) return [];
  const profiles = await db.select({ id: personProfiles.id, fullName: personProfiles.fullName })
    .from(personProfiles)
    .where(and(eq(personProfiles.status, "active"), eq(personProfiles.personType, "administrative")));
  const modes = await getCurrentAttendanceModes(profiles.map(p => p.id));
  return profiles.filter(p => modes.get(p.id) === "remote" || modes.get(p.id) === "mixed");
}

async function profilesOnApprovedLeave(start: Date, end: Date): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db.select({ profileId: leaveRequests.profileId })
    .from(leaveRequests)
    .where(and(inArray(leaveRequests.status, ["approved", "active"]), lt(leaveRequests.startAt, end), gt(leaveRequests.endAt, start)));
  return new Set(rows.map(r => r.profileId));
}

async function profileIdsWithCheckIn(start: Date, end: Date): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db.select({ profileId: attendanceRecords.profileId })
    .from(attendanceRecords)
    .where(and(gte(attendanceRecords.recordDate, start), lt(attendanceRecords.recordDate, end), isNotNull(attendanceRecords.checkInAt)));
  return new Set(rows.map(r => r.profileId));
}

/** موظف نشط غير مجاز وبدون بصمة دخول لآخر 3 أيام عمل (عادي) أو 5 أيام (عاجل). */
export async function detectAbsentEmployees(now = new Date()): Promise<SmartFinding[]> {
  if (!isSaudiWorkday(now) || isOfficialHoliday(now)) return [];
  const last3 = recentSaudiWorkdays(now, 3);
  const last5 = recentSaudiWorkdays(now, 5);
  if (last3.length < 3) return [];
  const r3 = { start: last3[last3.length - 1], end: new Date(last3[0].getTime() + 86400000) };
  const r5 = { start: last5[last5.length - 1], end: new Date(last5[0].getTime() + 86400000) };
  const [profiles, onLeave, present3, present5] = await Promise.all([
    activeAdministrativeProfiles(),
    profilesOnApprovedLeave(r5.start, r5.end),
    profileIdsWithCheckIn(r3.start, r3.end),
    profileIdsWithCheckIn(r5.start, r5.end),
  ]);
  const out: SmartFinding[] = [];
  for (const p of profiles) {
    if (onLeave.has(p.id)) continue;
    if (!present5.has(p.id)) out.push({ profileId: p.id, fullName: p.fullName, type: "urgent_absent", days: 5 });
    else if (!present3.has(p.id)) out.push({ profileId: p.id, fullName: p.fullName, type: "absent", days: 3 });
  }
  return out;
}

/** بصمة دخول بدون خروج في 3 أيام عمل أو أكثر. */
export async function detectMissingCheckouts(now = new Date()): Promise<SmartFinding[]> {
  const last3 = recentSaudiWorkdays(now, 3);
  if (last3.length < 3) return [];
  const start = last3[last3.length - 1];
  const end = new Date(last3[0].getTime() + 86400000);
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ profileId: attendanceRecords.profileId, fullName: personProfiles.fullName })
    .from(attendanceRecords)
    .innerJoin(personProfiles, eq(personProfiles.id, attendanceRecords.profileId))
    .where(and(gte(attendanceRecords.recordDate, start), lt(attendanceRecords.recordDate, end), isNotNull(attendanceRecords.checkInAt), isNull(attendanceRecords.checkOutAt)));
  const modes = await getCurrentAttendanceModes([...new Set(rows.map(r => r.profileId))]);
  const remoteRows = rows.filter(r => modes.get(r.profileId) === "remote" || modes.get(r.profileId) === "mixed");
  const counts = new Map<number, { fullName: string; n: number }>();
  for (const r of remoteRows) {
    const cur = counts.get(r.profileId) ?? { fullName: r.fullName ?? "", n: 0 };
    cur.n += 1;
    counts.set(r.profileId, cur);
  }
  return [...counts.entries()].filter(([, v]) => v.n >= 3).map(([id, v]) => ({ profileId: id, fullName: v.fullName, type: "missing_checkout" as const, days: v.n }));
}

/** تأخر (status=late) في آخر 5 أيام عمل متتالية. */
export async function detectChronicLate(now = new Date()): Promise<SmartFinding[]> {
  const workdays = recentSaudiWorkdays(now, 5);
  if (workdays.length < 5) return [];
  const start = workdays[workdays.length - 1];
  const end = new Date(workdays[0].getTime() + 86400000);
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ profileId: attendanceRecords.profileId, fullName: personProfiles.fullName, recordDate: attendanceRecords.recordDate })
    .from(attendanceRecords)
    .innerJoin(personProfiles, eq(personProfiles.id, attendanceRecords.profileId))
    .where(and(gte(attendanceRecords.recordDate, start), lt(attendanceRecords.recordDate, end), eq(attendanceRecords.status, "late")));
  const daySet = new Set(workdays.map(d => d.getTime()));
  const perProfile = new Map<number, { fullName: string; days: Set<number> }>();
  for (const r of rows) {
    const day = new Date(Date.UTC(r.recordDate.getUTCFullYear(), r.recordDate.getUTCMonth(), r.recordDate.getUTCDate())).getTime();
    if (!daySet.has(day)) continue;
    const cur = perProfile.get(r.profileId) ?? { fullName: r.fullName ?? "", days: new Set() };
    cur.days.add(day);
    perProfile.set(r.profileId, cur);
  }
  return [...perProfile.entries()].filter(([, v]) => v.days.size >= 5).map(([id, v]) => ({ profileId: id, fullName: v.fullName, type: "chronic_late" as const, days: v.days.size }));
}

/** المهام المتأخرة: يوم / 3 أيام / 5+ أيام. */
export async function detectLateTasks(now = new Date()): Promise<SmartFinding[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ assigneeProfileId: tasks.assigneeProfileId, title: tasks.title, dueAt: tasks.dueAt, fullName: personProfiles.fullName })
    .from(tasks)
    .leftJoin(personProfiles, eq(personProfiles.id, tasks.assigneeProfileId))
    .where(and(lt(tasks.dueAt, now), notInArray(tasks.status, ["completed", "cancelled"]), isNull(tasks.archivedAt)));
  const out: SmartFinding[] = [];
  for (const t of rows) {
    const days = Math.floor((now.getTime() - t.dueAt.getTime()) / 86400000);
    if (days < 1) continue;
    out.push({ profileId: t.assigneeProfileId ?? 0, fullName: t.fullName ?? "غير مسند", type: "late_task", days, detail: t.title ?? "" });
  }
  return out;
}

async function getOwnerProfileId(): Promise<number | null> {
  const db = await getDb();
  if (!db || !ENV.platformOwnerEmail) return null;
  const owner = (await db.select({ id: users.id }).from(users).where(eq(users.email, ENV.platformOwnerEmail)).limit(1))[0];
  if (!owner) return null;
  const profile = (await db.select({ id: personProfiles.id }).from(personProfiles).where(eq(personProfiles.userId, owner.id)).limit(1))[0];
  return profile?.id ?? null;
}

/** يُدرج إشعاراً واحداً للمالك (مع منع التكرار عبر dedupeKey) ويرسل بريداً عبر Brevo إن فُعّل. */
export async function notifyOwnerSmart(input: { type: SmartNotificationType; title: string; body: string; dedupeKey: string }): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const ownerId = await getOwnerProfileId();
  if (!ownerId) return null;
  const category = input.type === "late_task" ? "task_due" : "security_alert";
  await db.insert(notifications).values({ profileId: ownerId, category, title: input.title, body: input.body, dedupeKey: input.dedupeKey }).onDuplicateKeyUpdate({ set: { title: input.title, body: input.body } });
  if (ENV.brevoApiKey && ENV.brevoSenderEmail && ENV.platformOwnerEmail) {
    try {
      await sendBrevoTransactionalEmail({ to: ENV.platformOwnerEmail, recipientName: "مالك رَكيزة", subject: input.title, textContent: input.body });
    } catch (err) {
      console.warn("[smart-notifications] email skipped:", (err as Error)?.message ?? String(err));
    }
  }
  return ownerId;
}

/** يشغّل كل الكواشف ويُرسل تقريراً واحداً للمالك يومياً (مع منع الإرسال المكرر). */
export async function runSmartNotificationsCycle(now = new Date()) {
  const db = await getDb();
  if (!db) return { sent: false, findings: 0, skipped: "db-unavailable" };
  const [absent, missing, late, lateTasks] = await Promise.all([
    detectAbsentEmployees(now),
    detectMissingCheckouts(now),
    detectChronicLate(now),
    detectLateTasks(now),
  ]);
  const findings: SmartFinding[] = [...absent, ...missing, ...late, ...lateTasks];
  if (!findings.length) return { sent: false, findings: 0, skipped: "nothing" };
  const dayKey = saudiDayKey(now);
  const dedupeKey = `smart-summary-${dayKey}`;
  const [existing] = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.dedupeKey, dedupeKey)).limit(1);
  if (existing) return { sent: false, findings: findings.length, skipped: "already-sent" };

  const lines = findings.map(f => {
    if (f.type === "late_task") return `• مهمة متأخرة ${f.days} يوم: ${f.detail}${f.fullName && f.fullName !== "غير مسند" ? ` (${f.fullName})` : ""}`;
    if (f.type === "urgent_absent") return `• عاجل: ${f.fullName} بدون بصمة ${f.days} أيام`;
    if (f.type === "absent") return `• ${f.fullName} بدون بصمة ${f.days} أيام`;
    if (f.type === "missing_checkout") return `• ${f.fullName} بصمة دخول بدون خروج ${f.days} أيام`;
    return `• ${f.fullName} متأخر ${f.days} أيام متتالية`;
  });
  const body = `تقرير الإشعارات الذكية (${dayKey}):\n${lines.join("\n")}`;
  await notifyOwnerSmart({ type: "absent", title: `تقرير إشعارات ذكية — ${findings.length} ملاحظة`, body, dedupeKey });
  return { sent: true, findings: findings.length, dayKey };
}


