import { and, desc, eq, gt, gte, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import {
  auditLogs,
  courtRoleAssignments,
  delayRecords,
  documentRecords,
  internalMailMessages,
  leaveRequests,
  notifications,
  organizationUnits,
  permissionDelegations,
  personProfiles,
  registrationRequests,
  tasks,
  users,
  userWorkPreferences,
  attendanceRecords,
  scoreEvents,
  type CourtRole,
} from "../drizzle/schema";
import { getDb } from "./db";
import { assignCourtRole, getLeadershipWorkloadObservatory, getDepartmentPerformance, listActivityLog, logAudit, requestOtpCode } from "./court-service";
import {
  administrativeRouteOrder,
  assignmentBlockReason,
  buildOwnerKpis,
  defaultWorkPreferences,
  isDelegationActive,
  isValidSaudiPhone,
  normalizeSaudiPhone,
  rankSearchResults,
  scoreSearchHit,
  type WorkMode,
} from "./platform-completion";
import { reportStart } from "./reporting";
import { calculateComplianceRate } from "./attendance-confirmation-policy";
import { deadlineNudgeKind } from "./platform-completion";
import { webauthnCredentials } from "../drizzle/schema";

export async function countPasskeysForUser(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: webauthnCredentials.id }).from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId));
  return rows.length;
}

export async function passkeyEnrollmentStatus(userId: number) {
  const enrolled = await countPasskeysForUser(userId);
  return { enrolled: enrolled > 0, required: enrolled === 0, count: enrolled };
}

export async function getWorkPreferences(userId: number) {
  const db = await getDb();
  if (!db) return defaultWorkPreferences();
  const row = (await db.select().from(userWorkPreferences).where(eq(userWorkPreferences.userId, userId)).limit(1))[0];
  if (!row) return defaultWorkPreferences();
  let seenHelpKeys: string[] = [];
  try { seenHelpKeys = row.seenHelpKeys ? JSON.parse(row.seenHelpKeys) : []; } catch { seenHelpKeys = []; }
  return {
    workMode: row.workMode as WorkMode,
    notificationsEnabled: Boolean(row.notificationsEnabled),
    dndUntil: row.dndUntil ? row.dndUntil.toISOString() : null,
    seenHelpKeys,
  };
}

export async function updateWorkPreferences(input: { userId: number; workMode?: WorkMode; notificationsEnabled?: boolean; dndUntil?: Date | null; seenHelpKeys?: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const current = await getWorkPreferences(input.userId);
  const next = {
    workMode: input.workMode ?? current.workMode,
    notificationsEnabled: input.notificationsEnabled ?? current.notificationsEnabled,
    dndUntil: input.dndUntil === undefined ? (current.dndUntil ? new Date(current.dndUntil) : null) : input.dndUntil,
    seenHelpKeys: JSON.stringify(input.seenHelpKeys ?? current.seenHelpKeys),
  };
  const existing = (await db.select({ id: userWorkPreferences.id }).from(userWorkPreferences).where(eq(userWorkPreferences.userId, input.userId)).limit(1))[0];
  if (existing) await db.update(userWorkPreferences).set({ ...next, updatedAt: new Date() }).where(eq(userWorkPreferences.id, existing.id));
  else await db.insert(userWorkPreferences).values({ userId: input.userId, ...next });
  await logAudit({ actorUserId: input.userId, action: "user.work_preferences.updated", entityType: "user", entityId: input.userId, metadata: { workMode: next.workMode, notificationsEnabled: next.notificationsEnabled } });
  return getWorkPreferences(input.userId);
}

export async function createPermissionDelegation(input: { grantorUserId: number; delegateUserId: number; role: CourtRole; unitId?: number; title: string; startsAt: Date; endsAt: Date; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  if (input.endsAt <= input.startsAt) throw new Error("يجب أن يأتي انتهاء التفويض بعد بدايته.");
  if (input.delegateUserId === input.grantorUserId) throw new Error("لا يمكن تفويض الصلاحية إلى الحساب نفسه.");
  const result = await db.insert(permissionDelegations).values({
    grantorUserId: input.grantorUserId,
    delegateUserId: input.delegateUserId,
    role: input.role,
    unitId: input.unitId ?? null,
    title: input.title.trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: "active",
    notes: input.notes ?? null,
  });
  const id = Number(result[0].insertId);
  await assignCourtRole({ userId: input.delegateUserId, role: input.role, unitId: input.unitId, delegatedByUserId: input.grantorUserId, endsAt: input.endsAt });
  const delegateProfile = (await db.select({ id: personProfiles.id }).from(personProfiles).where(eq(personProfiles.userId, input.delegateUserId)).limit(1))[0];
  if (delegateProfile) {
    await db.insert(notifications).values({
      profileId: delegateProfile.id,
      category: "task_due",
      title: "تفويض صلاحية مؤقت",
      body: `مُنحت صلاحية مؤقتة: ${input.title}. تختفي تلقائياً عند انتهاء المهمة في ${input.endsAt.toLocaleString("ar-SA")}.`,
      dedupeKey: `permission-delegation-${id}`,
    });
  }
  await logAudit({ actorUserId: input.grantorUserId, action: "permission_delegation.created", entityType: "permission_delegation", entityId: id, metadata: { delegateUserId: input.delegateUserId, role: input.role, endsAt: input.endsAt.toISOString() } });
  return { id };
}

export async function listPermissionDelegations(actorUserId: number, isOwner: boolean) {
  const db = await getDb();
  if (!db) return [];
  await expirePermissionDelegations();
  const rows = await db.select({
    delegation: permissionDelegations,
    delegateName: users.name,
    delegateEmail: users.email,
  }).from(permissionDelegations).leftJoin(users, eq(users.id, permissionDelegations.delegateUserId)).orderBy(desc(permissionDelegations.createdAt)).limit(200);
  return rows.filter(row => isOwner || row.delegation.grantorUserId === actorUserId || row.delegation.delegateUserId === actorUserId);
}

export async function cancelPermissionDelegation(input: { delegationId: number; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const row = (await db.select().from(permissionDelegations).where(eq(permissionDelegations.id, input.delegationId)).limit(1))[0];
  if (!row) throw new Error("التفويض غير موجود.");
  await db.update(permissionDelegations).set({ status: "cancelled", updatedAt: new Date() }).where(eq(permissionDelegations.id, input.delegationId));
  await db.update(courtRoleAssignments).set({ isActive: false, endsAt: new Date() }).where(and(eq(courtRoleAssignments.userId, row.delegateUserId), eq(courtRoleAssignments.role, row.role), eq(courtRoleAssignments.delegatedByUserId, row.grantorUserId), eq(courtRoleAssignments.isActive, true)));
  await logAudit({ actorUserId: input.actorUserId, action: "permission_delegation.cancelled", entityType: "permission_delegation", entityId: input.delegationId });
  return { success: true };
}

export async function expirePermissionDelegations(now = new Date()) {
  const db = await getDb();
  if (!db) return { expired: 0 };
  const active = await db.select().from(permissionDelegations).where(eq(permissionDelegations.status, "active"));
  let expired = 0;
  for (const row of active) {
    if (isDelegationActive({ startsAt: row.startsAt, endsAt: row.endsAt, now })) continue;
    await db.update(permissionDelegations).set({ status: "ended", updatedAt: now }).where(eq(permissionDelegations.id, row.id));
    await db.update(courtRoleAssignments).set({ isActive: false, endsAt: now }).where(and(eq(courtRoleAssignments.userId, row.delegateUserId), eq(courtRoleAssignments.role, row.role), eq(courtRoleAssignments.isActive, true), eq(courtRoleAssignments.delegatedByUserId, row.grantorUserId)));
    expired += 1;
  }
  return { expired };
}

export async function activeDelegatedRolesForUser(userId: number, now = new Date()) {
  const db = await getDb();
  if (!db) return [] as CourtRole[];
  const rows = await db.select().from(permissionDelegations).where(and(eq(permissionDelegations.delegateUserId, userId), eq(permissionDelegations.status, "active")));
  return rows.filter(row => isDelegationActive({ startsAt: row.startsAt, endsAt: row.endsAt, now })).map(row => row.role as CourtRole);
}

export async function setOrganizationUnitActive(input: { unitId: number; isActive: boolean; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const unit = (await db.select().from(organizationUnits).where(eq(organizationUnits.id, input.unitId)).limit(1))[0];
  if (!unit) throw new Error("القسم غير موجود.");
  await db.update(organizationUnits).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(organizationUnits.id, input.unitId));
  await logAudit({ actorUserId: input.actorUserId, action: input.isActive ? "organization_unit.activated" : "organization_unit.archived", entityType: "organization_unit", entityId: input.unitId, metadata: { name: unit.name, archivedNotDeleted: true } });
  return { success: true, isActive: input.isActive };
}

export async function listOrganizationUnitsIncludingArchived() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(organizationUnits).orderBy(organizationUnits.isActive, organizationUnits.name);
}

export async function globalSearch(input: { query: string; userId: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const needle = `%${input.query.trim()}%`;
  const [taskRows, peopleRows, reportRows, mailRows, auditRows] = await Promise.all([
    db.select({ id: tasks.id, title: tasks.title, status: tasks.status }).from(tasks).where(like(tasks.title, needle)).limit(40),
    db.select({ id: personProfiles.id, fullName: personProfiles.fullName, jobTitle: personProfiles.jobTitle, email: personProfiles.email }).from(personProfiles).where(or(like(personProfiles.fullName, needle), like(personProfiles.email, needle), like(personProfiles.jobTitle, needle))).limit(40),
    db.select({ id: documentRecords.id, title: documentRecords.title, documentType: documentRecords.documentType }).from(documentRecords).where(like(documentRecords.title, needle)).limit(40),
    db.select({ id: internalMailMessages.id, subject: internalMailMessages.subject, body: internalMailMessages.body }).from(internalMailMessages).where(or(like(internalMailMessages.subject, needle), like(internalMailMessages.body, needle))).limit(40),
    db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType }).from(auditLogs).where(or(like(auditLogs.action, needle), like(auditLogs.entityType, needle))).limit(40),
  ]);
  const hits = [
    ...taskRows.map(row => ({ type: "task" as const, id: row.id, title: row.title, subtitle: row.status, href: `/tasks?taskId=${row.id}`, score: scoreSearchHit(input.query, [row.title, row.status]) })),
    ...peopleRows.map(row => ({ type: "person" as const, id: row.id, title: row.fullName, subtitle: row.jobTitle || row.email || "", href: `/people`, score: scoreSearchHit(input.query, [row.fullName, row.jobTitle, row.email]) })),
    ...reportRows.map(row => ({ type: "report" as const, id: row.id, title: row.title, subtitle: row.documentType, href: `/reports`, score: scoreSearchHit(input.query, [row.title, row.documentType]) })),
    ...mailRows.map(row => ({ type: "mail" as const, id: row.id, title: row.subject, subtitle: (row.body || "").slice(0, 80), href: `/rakiza-mail`, score: scoreSearchHit(input.query, [row.subject, row.body]) })),
    ...auditRows.map(row => ({ type: "audit" as const, id: row.id, title: row.action, subtitle: row.entityType, href: `/activity-log`, score: scoreSearchHit(input.query, [row.action, row.entityType]) })),
  ];
  return rankSearchResults(hits, input.limit ?? 25);
}

export async function getOwnerLeadershipKpis(periodArg: "daily" | "weekly" | "monthly" = "monthly") {
  const db = await getDb();
  const period = { startAt: reportStart(periodArg, new Date()), endAt: new Date() };
  const [units, observatory, delays, completed, profiles, scores, attendance] = await Promise.all([
    getDepartmentPerformance({ startAt: period.startAt, endAt: period.endAt }),
    getLeadershipWorkloadObservatory(),
    db ? db.select({ id: delayRecords.id }).from(delayRecords).where(inArray(delayRecords.status, ["overdue", "under_follow_up"])) : Promise.resolve([]),
    db ? db.select({ createdAt: tasks.createdAt, dueAt: tasks.dueAt, updatedAt: tasks.updatedAt }).from(tasks).where(eq(tasks.status, "completed")).limit(400) : Promise.resolve([]),
    db ? db.select({ id: personProfiles.id, fullName: personProfiles.fullName }).from(personProfiles).where(and(eq(personProfiles.personType, "administrative"), eq(personProfiles.status, "active"))) : Promise.resolve([]),
    db ? db.select({ profileId: scoreEvents.profileId, points: scoreEvents.points }).from(scoreEvents) : Promise.resolve([]),
    db ? db.select({ profileId: attendanceRecords.profileId, status: attendanceRecords.status }).from(attendanceRecords).where(gte(attendanceRecords.recordDate, period.startAt)) : Promise.resolve([]),
  ]);
  const completionHours = completed
    .map(task => (new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime()) / 36e5)
    .filter(hours => hours > 0 && hours < 24 * 30);
  const averageCompletionHours = completionHours.length ? Math.round((completionHours.reduce((sum, hours) => sum + hours, 0) / completionHours.length) * 10) / 10 : null;

  const pointsByProfile = new Map<number, number>();
  for (const score of scores) pointsByProfile.set(score.profileId, (pointsByProfile.get(score.profileId) ?? 0) + score.points);
  const confirmedByProfile = new Map<number, number>();
  for (const record of attendance) {
    if (record.status === "present" || record.status === "late") confirmedByProfile.set(record.profileId, (confirmedByProfile.get(record.profileId) ?? 0) + 1);
  }
  const employees = profiles.map(profile => ({
    profileId: profile.id,
    fullName: profile.fullName,
    points: pointsByProfile.get(profile.id) ?? 0,
    complianceRate: calculateComplianceRate(confirmedByProfile.get(profile.id) ?? 0, 30),
  }));

  return buildOwnerKpis({
    units,
    pressure: observatory.units.map(unit => ({ unitName: unit.unitName, pressureScore: unit.pressureScore, pressureLevel: unit.pressureLevel })),
    accountabilityCount: delays.length,
    averageCompletionHours,
    employees,
  });
}

export async function searchGovernanceArchive(query: string) {
  const db = await getDb();
  if (!db || !query.trim()) return [];
  const logs = await listActivityLog({ limit: 300 });
  return logs.filter(item => scoreSearchHit(query, [item.audit.action, item.audit.entityType, item.actorName, item.audit.metadata]) > 0);
}

export async function sendDeadlineNudges(now = new Date()) {
  const db = await getDb();
  if (!db) return { nudged24h: 0, nudged12h: 0 };
  const open = await db.select().from(tasks).where(inArray(tasks.status, ["new", "in_progress", "under_review"]));
  let nudged24h = 0;
  let nudged12h = 0;
  for (const task of open) {
    if (!task.assigneeProfileId || !task.dueAt) continue;
    const kind = deadlineNudgeKind(task.dueAt, now);
    if (kind === "none") continue;
    const title = kind === "12h" ? "تذكير: تبقى 12 ساعة على الموعد" : "تذكير: تبقى 24 ساعة على الموعد";
    const key = `task-nudge-${kind}-${task.assigneeProfileId}-${task.id}`;
    await db.insert(notifications).values({
      profileId: task.assigneeProfileId,
      category: "task_due",
      title,
      body: `المهمة «${task.title}» تقترب من موعد الاستحقاق. راجعها قبل التصعيد الآلي.`,
      dedupeKey: key,
    }).onDuplicateKeyUpdate({ set: { title } });
    if (kind === "12h") nudged12h += 1;
    else nudged24h += 1;
  }
  await logAudit({ action: "automation.deadline_nudge", entityType: "task_automation", metadata: { nudged24h, nudged12h } });
  return { nudged24h, nudged12h };
}

export async function requestOtpByPhone(input: { phone: string; requestIp?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const phone = normalizeSaudiPhone(input.phone);
  if (!isValidSaudiPhone(phone)) throw new Error("أدخل رقم جوال سعودي صحيح يبدأ بـ 05.");
  const profile = (await db.select({ email: personProfiles.email, userId: personProfiles.userId, fullName: personProfiles.fullName, phone: personProfiles.phone }).from(personProfiles).where(or(eq(personProfiles.phone, phone), eq(personProfiles.phone, input.phone.trim()))).limit(1))[0];
  const user = profile?.userId
    ? (await db.select({ email: users.email, backupEmail: users.backupEmail, phone: users.phone }).from(users).where(eq(users.id, profile.userId)).limit(1))[0]
    : (await db.select({ email: users.email, backupEmail: users.backupEmail, phone: users.phone }).from(users).where(eq(users.phone, phone)).limit(1))[0];
  const officialEmail = (user?.email || profile?.email || "").trim().toLowerCase();
  if (!officialEmail) throw new Error("لا يوجد حساب مرتبط بهذا الجوال. تواصل مع مالك المنصة لتحديث رقمك.");
  return requestOtpCode({ officialEmail, requestIp: input.requestIp });
}

export async function assertAssigneeCanReceiveTask(assigneeProfileId?: number | null) {
  if (!assigneeProfileId) return;
  const db = await getDb();
  if (!db) return;
  const profile = (await db.select({ status: personProfiles.status, fullName: personProfiles.fullName }).from(personProfiles).where(eq(personProfiles.id, assigneeProfileId)).limit(1))[0];
  const reason = assignmentBlockReason(profile?.status);
  if (reason) throw new Error(reason);
}

export function routeSequenceLabel() {
  return administrativeRouteOrder().map(role => ({
    role,
    label: role === "department_manager" ? "مدير القسم" : role === "peer_department_manager" ? "مدير قسم آخر" : role === "court_secretary" ? "أمين المحكمة" : role === "assistant_secretary" ? "الأمين المساعد" : role === "assistant_president" ? "مساعد الرئيس" : "رئيس المحكمة",
  }));
}

export { gte, lte, eq, and, isNull, gt, sql };
