import * as archiverModule from "archiver";
const ZipArchive = (archiverModule as unknown as { ZipArchive?: new (options?: { zlib?: { level: number } }) => any }).ZipArchive;
import { and, asc, desc, eq, gt, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import {
  accessGrants,
  conversationAttachments,
  conversationMessageReactions,
  conversationMessages,
  conversationParticipants,
  correspondences,
  correspondenceActions,
  correspondenceRecipients,
  correspondenceTemplates,
  courtRoleAssignments,
  dataExportJobs,
  departmentAccounts,
  organizationUnits,
  personProfiles,
  taskComments,
  tasks,
  users,
  internalConversations,
  notifications,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { createTask, logAudit } from "./court-service";
import { sendPushForNotification } from "./push-service";

const LEADERSHIP_ROLES = new Set(["court_president", "assistant_president", "court_secretary", "human_resources_manager", "performance_monitor"]);
const MANAGER_ROLES = new Set(["department_manager", ...Array.from(LEADERSHIP_ROLES)]);
const MAX_TEMPLATE_COUNT = 10;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_ATTACHMENT_BYTES = 32 * 1024 * 1024;
const ZIP_BATCH_MAX_ITEMS = 5;
const MAX_ZIP_SOURCE_ITEMS = 25;
export const INTERNAL_MESSAGE_REACTIONS = ["👍", "✅", "👀", "🙏", "⚠️"] as const;

export function isSupportedInternalMessageReaction(reaction: string) {
  return (INTERNAL_MESSAGE_REACTIONS as readonly string[]).includes(reaction);
}
const ALLOWED_ATTACHMENT_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "text/plain",
  "application/zip",
]);

async function getActorContext(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const departmentAccount = (await db.select().from(departmentAccounts).where(and(eq(departmentAccounts.userId, userId), eq(departmentAccounts.isActive, true))).limit(1))[0];
  let profile = (await db.select().from(personProfiles).where(eq(personProfiles.userId, userId)).limit(1))[0];
  // الحساب المؤسسي قد يستخدم userId مختلفاً عن ملف الموظف؛ profileId هو الربط المعتمد له.
  if (!profile && departmentAccount?.profileId) {
    profile = (await db.select().from(personProfiles).where(eq(personProfiles.id, departmentAccount.profileId)).limit(1))[0];
  }
  if (!profile) throw new Error("لا يوجد ملف موظف مرتبط بالحساب الحالي.");
  const roles = await db.select().from(courtRoleAssignments).where(and(eq(courtRoleAssignments.userId, userId), eq(courtRoleAssignments.isActive, true)));
  if (departmentAccount && !roles.some(role => role.role === "department_manager" && role.unitId === departmentAccount.unitId)) roles.push({ role: "department_manager", unitId: departmentAccount.unitId } as typeof roles[number]);
  const accessGrant = (await db.select({ permission: accessGrants.permission }).from(accessGrants).where(and(eq(accessGrants.userId, userId), eq(accessGrants.isActive, true))).limit(1))[0];
  return { db, profile, roles, departmentAccount: departmentAccount ?? null, permission: accessGrant?.permission ?? null };
}

export function canBootstrapCustomConversationActor(input: { userRole?: string | null; permission?: string | null; roles: Array<{ role: string }> }) {
  return input.userRole === "admin" || input.permission === "full_control" || input.roles.some(role => LEADERSHIP_ROLES.has(role.role));
}

async function getCustomConversationActorContext(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const user = (await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, userId)).limit(1))[0];
  const accessGrant = (await db.select({ permission: accessGrants.permission }).from(accessGrants).where(and(eq(accessGrants.userId, userId), eq(accessGrants.isActive, true))).limit(1))[0];
  const roles = await db.select().from(courtRoleAssignments).where(and(eq(courtRoleAssignments.userId, userId), eq(courtRoleAssignments.isActive, true)));
  let profile = (await db.select().from(personProfiles).where(eq(personProfiles.userId, userId)).limit(1))[0];
  if (!profile) {
    if (!canBootstrapCustomConversationActor({ userRole: user?.role, permission: accessGrant?.permission, roles })) throw new Error("لا يوجد ملف موظف مرتبط بالحساب الحالي.");
    const displayName = user?.name?.trim() || user?.email?.trim() || "مالك المنصة";
    const result = await db.insert(personProfiles).values({ userId, personType: "administrative", fullName: displayName.slice(0, 240), email: user?.email ?? null, jobTitle: "مالك المنصة", status: "active", employmentStatus: "حساب إداري للمنصة", sourceReference: "platform-owner-account" });
    profile = (await db.select().from(personProfiles).where(eq(personProfiles.id, Number(result[0].insertId))).limit(1))[0];
  }
  if (!profile) throw new Error("تعذر تهيئة ملف منشئ المجموعة.");
  return { db, profile, roles, permission: accessGrant?.permission ?? null };
}

function isManager(roles: Array<{ role: string }>) {
  return roles.some(role => MANAGER_ROLES.has(role.role));
}

function canManageUnit(roles: Array<{ role: string; unitId: number | null }>, unitId: number) {
  return roles.some(role => LEADERSHIP_ROLES.has(role.role) || (role.role === "department_manager" && role.unitId === unitId));
}

export function canSearchInternalPeopleWithoutProfile(permission: string | null | undefined, roles: Array<{ role: string }>) {
  return permission === "full_control" || roles.some(role => LEADERSHIP_ROLES.has(role.role));
}

export async function listManagerTemplates(userId: number) {
  const { db, profile, roles } = await getActorContext(userId);
  if (!isManager(roles)) throw new Error("قوالب المراسلات متاحة لمديري الأقسام والقيادة فقط.");
  const unitIds = Array.from(new Set(roles.filter(role => role.role === "department_manager" && role.unitId).map(role => role.unitId as number)));
  const allowedUnits = unitIds.length ? unitIds : profile.unitId ? [profile.unitId] : [];
  if (!allowedUnits.length && !roles.some(role => LEADERSHIP_ROLES.has(role.role))) return [];
  const condition = roles.some(role => LEADERSHIP_ROLES.has(role.role)) ? eq(correspondenceTemplates.isActive, true) : and(eq(correspondenceTemplates.isActive, true), inArray(correspondenceTemplates.unitId, allowedUnits));
  return db.select({ template: correspondenceTemplates, unitName: organizationUnits.name }).from(correspondenceTemplates).leftJoin(organizationUnits, eq(organizationUnits.id, correspondenceTemplates.unitId)).where(condition).orderBy(asc(correspondenceTemplates.name));
}

export async function createManagerTemplate(input: { userId: number; name: string; subject: string; body: string; unitId?: number | null }) {
  const { db, profile, roles } = await getActorContext(input.userId);
  if (!isManager(roles)) throw new Error("لا تملك صلاحية إنشاء قوالب المراسلات.");
  const unitId = input.unitId ?? profile.unitId;
  if (!unitId || !canManageUnit(roles, unitId)) throw new Error("اختر قسماً ضمن نطاق صلاحيتك.");
  const countRows = await db.select({ count: sql<number>`count(*)` }).from(correspondenceTemplates).where(and(eq(correspondenceTemplates.ownerProfileId, profile.id), eq(correspondenceTemplates.isActive, true)));
  if (Number(countRows[0]?.count ?? 0) >= MAX_TEMPLATE_COUNT) throw new Error("يمكن لكل مدير قسم حفظ عشرة قوالب مخصصة كحد أقصى.");
  const result = await db.insert(correspondenceTemplates).values({ unitId, ownerProfileId: profile.id, name: input.name.trim().slice(0, 180), subject: input.subject.trim().slice(0, 255), body: input.body.trim(), createdByUserId: input.userId });
  const id = Number(result[0].insertId);
  await logAudit({ actorUserId: input.userId, action: "correspondence_template.created", entityType: "correspondence_template", entityId: id, metadata: { unitId, ownerProfileId: profile.id } });
  return { id };
}

export async function updateManagerTemplate(input: { userId: number; templateId: number; name: string; subject: string; body: string }) {
  const { db, profile } = await getActorContext(input.userId);
  const template = (await db.select().from(correspondenceTemplates).where(and(eq(correspondenceTemplates.id, input.templateId), eq(correspondenceTemplates.ownerProfileId, profile.id), eq(correspondenceTemplates.isActive, true))).limit(1))[0];
  if (!template) throw new Error("القالب غير موجود أو لا تملك تعديله.");
  await db.update(correspondenceTemplates).set({ name: input.name.trim().slice(0, 180), subject: input.subject.trim().slice(0, 255), body: input.body.trim() }).where(eq(correspondenceTemplates.id, input.templateId));
  await logAudit({ actorUserId: input.userId, action: "correspondence_template.updated", entityType: "correspondence_template", entityId: input.templateId });
  return { ok: true };
}

export async function archiveManagerTemplate(input: { userId: number; templateId: number }) {
  const { db, profile } = await getActorContext(input.userId);
  const template = (await db.select().from(correspondenceTemplates).where(and(eq(correspondenceTemplates.id, input.templateId), eq(correspondenceTemplates.ownerProfileId, profile.id), eq(correspondenceTemplates.isActive, true))).limit(1))[0];
  if (!template) throw new Error("القالب غير موجود أو لا تملك تعديله.");
  await db.update(correspondenceTemplates).set({ isActive: false }).where(eq(correspondenceTemplates.id, input.templateId));
  await logAudit({ actorUserId: input.userId, action: "correspondence_template.archived", entityType: "correspondence_template", entityId: input.templateId });
  return { ok: true };
}

export async function searchInternalPeople(input: { userId: number; query?: string; unitId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const query = input.query?.trim() ?? "";
  if (!input.unitId && query.length < 2) throw new Error("اكتب حرفين على الأقل للبحث بالاسم أو البريد.");
  // البحث لا يحتاج ملفاً شخصياً للمالك؛ إنشاء المحادثة سيظل يتطلب ملف مرسل صالحاً.
  const grant = (await db.select({ permission: accessGrants.permission }).from(accessGrants).where(and(eq(accessGrants.userId, input.userId), eq(accessGrants.isActive, true))).limit(1))[0];
  const profile = (await db.select({ id: personProfiles.id }).from(personProfiles).where(eq(personProfiles.userId, input.userId)).limit(1))[0];
  const roles = await db.select({ role: courtRoleAssignments.role }).from(courtRoleAssignments).where(and(eq(courtRoleAssignments.userId, input.userId), eq(courtRoleAssignments.isActive, true)));
  const canSearchWithoutProfile = canSearchInternalPeopleWithoutProfile(grant?.permission, roles);
  if (!profile && !canSearchWithoutProfile) throw new Error("لا يوجد ملف موظف مرتبط بالحساب الحالي.");
  // اختيار القسم يضيق النتائج لذلك القسم فقط، أما البحث العام فلا يبدأ إلا بعد إدخال حرفين ولا يعرض قائمة كاملة تلقائياً.
  const conditions = [eq(personProfiles.status, "active" as const)];
  if (input.unitId) conditions.push(eq(personProfiles.unitId, input.unitId));
  if (query) conditions.push(or(like(personProfiles.fullName, `%${query}%`), like(personProfiles.email, `%${query}%`))!);
  return db.select({ profile: personProfiles, unitName: organizationUnits.name }).from(personProfiles).leftJoin(organizationUnits, eq(organizationUnits.id, personProfiles.unitId)).where(and(...conditions)).orderBy(asc(personProfiles.fullName)).limit(50);
}

export async function listFrequentContacts(userId: number) {
  const { db, profile } = await getActorContext(userId);
  const rows = await db.select({ profile: personProfiles, count: sql<number>`count(*)` })
    .from(correspondences)
    .innerJoin(correspondenceRecipients, eq(correspondenceRecipients.correspondenceId, correspondences.id))
    .innerJoin(personProfiles, eq(personProfiles.id, correspondenceRecipients.profileId))
    .where(eq(correspondences.senderProfileId, profile.id))
    .groupBy(personProfiles.id)
    .orderBy(desc(sql`count(*)`))
    .limit(8);
  return rows;
}

export async function createInternalConversation(input: { userId: number; participantProfileIds: number[]; subject?: string; body: string; conversationType?: "direct" | "department" | "custom" | "general" | "task"; taskId?: number; unitId?: number | null; attachments?: Array<{ originalName: string; mimeType: string; contentBase64: string }> }) {
  const { db, profile } = await getActorContext(input.userId);
  const participantIds = Array.from(new Set([profile.id, ...input.participantProfileIds]));
  if (participantIds.length < 2) throw new Error("اختر موظفاً واحداً على الأقل لبدء المحادثة.");
  const targets = await db.select().from(personProfiles).where(inArray(personProfiles.id, participantIds));
  if (targets.length !== participantIds.length || targets.some(target => target.status !== "active")) throw new Error("أحد مستلمي المحادثة غير متاح.");
  const unitId = input.unitId ?? profile.unitId ?? null;
  const conversationResult = await db.insert(internalConversations).values({ subject: input.subject?.trim().slice(0, 255) || null, conversationType: input.conversationType ?? "direct", unitId, taskId: input.taskId ?? null, createdByProfileId: profile.id });
  const conversationId = Number(conversationResult[0].insertId);
  await db.insert(conversationParticipants).values(participantIds.map(profileId => ({ conversationId, profileId })));
  const messageResult = await db.insert(conversationMessages).values({ conversationId, senderProfileId: profile.id, body: input.body.trim() });
  const messageId = Number(messageResult[0].insertId);
  for (const attachment of input.attachments ?? []) await addConversationAttachment({ db, messageId, profileId: profile.id, attachment });
  await logAudit({ actorUserId: input.userId, action: "internal_conversation.created", entityType: "internal_conversation", entityId: conversationId, metadata: { participants: participantIds.length, attachments: input.attachments?.length ?? 0 } });
  return { conversationId, messageId };
}

export function canCreateCustomConversation(roles: Array<{ role: string }>, permission?: string | null) {
  return permission === "full_control" || roles.some(role => ["court_president", "assistant_president", "court_secretary", "department_manager"].includes(role.role));
}

export async function createCustomConversation(input: { userId: number; name: string; participantProfileIds: number[]; body?: string }) {
  const { db, profile, roles, permission } = await getCustomConversationActorContext(input.userId);
  const canCreate = canCreateCustomConversation(roles, permission);
  if (!canCreate) throw new Error("إنشاء المجموعات المخصصة متاح لرئيس القسم أو قادة المنصة فقط.");
  const participantIds = Array.from(new Set([profile.id, ...input.participantProfileIds]));
  if (participantIds.length < 2) throw new Error("اختر عضواً واحداً على الأقل للمجموعة.");
  const targets = await db.select({ id: personProfiles.id, unitId: personProfiles.unitId }).from(personProfiles).where(and(inArray(personProfiles.id, participantIds), eq(personProfiles.status, "active")));
  if (targets.length !== participantIds.length) throw new Error("أحد أعضاء المجموعة غير موجود أو غير نشط.");
  const hasLeadershipScope = permission === "full_control" || roles.some(role => LEADERSHIP_ROLES.has(role.role));
  const managedUnitIds = Array.from(new Set(roles.filter(role => role.role === "department_manager" && role.unitId).map(role => role.unitId as number)));
  if (!hasLeadershipScope) {
    if (!managedUnitIds.length) throw new Error("لا يوجد قسم مرتبط بصلاحية رئيس القسم الحالية.");
    if (targets.some(target => !target.unitId || !managedUnitIds.includes(target.unitId))) throw new Error("يمكن لرئيس القسم إضافة موظفي قسمه فقط إلى المجموعة.");
  }
  const created = await db.insert(internalConversations).values({ subject: input.name.trim().slice(0, 255), conversationType: "custom", unitId: null, taskId: null, createdByProfileId: profile.id });
  const conversationId = Number(created[0].insertId);
  await db.insert(conversationParticipants).values(participantIds.map(profileId => ({ conversationId, profileId })));
  if (input.body?.trim()) await db.insert(conversationMessages).values({ conversationId, senderProfileId: profile.id, body: input.body.trim() });
  await logAudit({ actorUserId: input.userId, action: "custom_conversation.created", entityType: "internal_conversation", entityId: conversationId, metadata: { participants: participantIds.length } });
  return { conversationId };
}

function isPdfBytes(bytes: Buffer) {
  return bytes.subarray(0, 8).toString("ascii").startsWith("%PDF-");
}

export function validateConversationAttachment(attachment: { mimeType: string; contentBase64: string }, allowGeneratedZip = false) {
  const bytes = Buffer.from(attachment.contentBase64, "base64");
  const normalizedMime = attachment.mimeType === "application/octet-stream" && isPdfBytes(bytes) ? "application/pdf" : attachment.mimeType;
  if (!ALLOWED_ATTACHMENT_MIME.has(normalizedMime) || (normalizedMime === "application/zip" && !allowGeneratedZip)) throw new Error("نوع المرفق غير مسموح به.");
  const maxBytes = normalizedMime === "application/zip" ? MAX_ZIP_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES;
  if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new Error(normalizedMime === "application/zip" ? "حجم حزمة ZIP يتجاوز 32 ميجابايت." : "حجم المرفق يتجاوز 8 ميجابايت.");
  if (normalizedMime === "application/pdf" && !isPdfBytes(bytes)) throw new Error("محتوى ملف PDF غير صالح.");
  return bytes;
}

export async function packageConversationAttachments(input: { attachments: Array<{ originalName: string; mimeType: string; contentBase64: string }> }) {
  if (input.attachments.length < ZIP_BATCH_MAX_ITEMS + 1) throw new Error("يُستخدم التجميع عند تجاوز خمسة مرفقات.");
  if (input.attachments.length > MAX_ZIP_SOURCE_ITEMS) throw new Error("يمكن تجميع خمسة وعشرين مرفقاً كحد أقصى في الرسالة الواحدة.");
  const prepared = input.attachments.map(attachment => ({ ...attachment, bytes: validateConversationAttachment(attachment) }));
  if (prepared.reduce((total, attachment) => total + attachment.bytes.byteLength, 0) > MAX_ZIP_ATTACHMENT_BYTES) throw new Error("إجمالي المرفقات المراد تجميعها يتجاوز 32 ميجابايت.");
  const batches: typeof prepared[] = [];
  for (let index = 0; index < prepared.length; index += ZIP_BATCH_MAX_ITEMS) batches.push(prepared.slice(index, index + ZIP_BATCH_MAX_ITEMS));
  const archives = await Promise.all(batches.map(async (batch, index) => {
    const buffer = await buildZipArchiveBuffer(batch.map((attachment, itemIndex) => ({ name: `${String(itemIndex + 1).padStart(2, "0")}-${attachment.originalName.replace(/[\\/]+/g, "_").slice(0, 180)}`, content: attachment.bytes })));
    if (buffer.byteLength > MAX_ZIP_ATTACHMENT_BYTES) throw new Error(`حزمة المرفقات رقم ${index + 1} تتجاوز 32 ميجابايت.`);
    return { originalName: `مرفقات-الدردشة-${index + 1}-من-${batches.length}.zip`, mimeType: "application/zip", contentBase64: buffer.toString("base64") };
  }));
  return archives;
}

async function addConversationAttachment(input: { db: any; messageId: number; profileId: number; attachment: { originalName: string; mimeType: string; contentBase64: string }; allowGeneratedZip?: boolean }) {
  const bytes = validateConversationAttachment(input.attachment, input.allowGeneratedZip);
  const mimeType = input.attachment.mimeType === "application/octet-stream" && isPdfBytes(bytes) ? "application/pdf" : input.attachment.mimeType;
  await input.db.insert(conversationAttachments).values({ messageId: input.messageId, originalName: input.attachment.originalName.slice(0, 255), mimeType, sizeBytes: bytes.byteLength, contentBase64: input.attachment.contentBase64, storageKey: null, storageUrl: null, uploadedByProfileId: input.profileId });
}

export async function ensureGeneralConversation(db: any, profile: { id: number }) {
  const existing = (await db.select({ id: internalConversations.id }).from(internalConversations).where(eq(internalConversations.conversationType, "general")).limit(1))[0];
  if (existing) return existing.id;
  const members = await db.select({ id: personProfiles.id }).from(personProfiles).where(eq(personProfiles.status, "active"));
  if (!members.some((member: { id: number }) => member.id === profile.id)) members.push({ id: profile.id });
  const created = await db.insert(internalConversations).values({ subject: "صندوق المحادثة العامة", conversationType: "general", unitId: null, taskId: null, createdByProfileId: profile.id });
  const conversationId = Number(created[0].insertId);
  await db.insert(conversationParticipants).values(members.map((member: { id: number }) => ({ conversationId, profileId: member.id })));
  return conversationId;
}

export async function ensureDepartmentConversation(db: any, profile: { id: number; unitId: number | null }) {
  if (!profile.unitId) return null;
  const existing = (await db.select({ id: internalConversations.id }).from(internalConversations).where(and(eq(internalConversations.unitId, profile.unitId), eq(internalConversations.conversationType, "department"))).limit(1))[0];
  if (existing) return existing.id;
  const members = await db.select({ id: personProfiles.id }).from(personProfiles).where(and(eq(personProfiles.unitId, profile.unitId), eq(personProfiles.status, "active")));
  if (!members.some((member: { id: number }) => member.id === profile.id)) members.push({ id: profile.id });
  const created = await db.insert(internalConversations).values({ subject: "دردشة القسم", conversationType: "department", unitId: profile.unitId, taskId: null, createdByProfileId: profile.id });
  const conversationId = Number(created[0].insertId);
  await db.insert(conversationParticipants).values(members.map((member: { id: number }) => ({ conversationId, profileId: member.id })));
  return conversationId;
}

export async function listInternalConversations(userId: number) {
  let context: Awaited<ReturnType<typeof getActorContext>>;
  try { context = await getActorContext(userId); } catch { return []; }
  const { db, profile } = context;
  await ensureDepartmentConversation(db, profile);
  await ensureGeneralConversation(db, profile);
  const rows = await db.select({ conversation: internalConversations, participant: conversationParticipants })
    .from(conversationParticipants)
    .innerJoin(internalConversations, eq(internalConversations.id, conversationParticipants.conversationId))
    .where(eq(conversationParticipants.profileId, profile.id))
    .orderBy(desc(internalConversations.updatedAt)).limit(100);
  return Promise.all(rows.map(async row => {
    const unreadAfterLastRead = row.participant.lastReadAt ? gt(conversationMessages.createdAt, row.participant.lastReadAt) : sql`true`;
    const [lastMessage, otherMember, memberCountRows, unreadRows] = await Promise.all([
      db.select({ body: conversationMessages.body, createdAt: conversationMessages.createdAt, senderProfileId: conversationMessages.senderProfileId, senderName: personProfiles.fullName }).from(conversationMessages).innerJoin(personProfiles, eq(personProfiles.id, conversationMessages.senderProfileId)).where(eq(conversationMessages.conversationId, row.conversation.id)).orderBy(desc(conversationMessages.createdAt), desc(conversationMessages.id)).limit(1),
      row.conversation.conversationType === "direct" ? db.select({ fullName: personProfiles.fullName, jobTitle: personProfiles.jobTitle }).from(conversationParticipants).innerJoin(personProfiles, eq(personProfiles.id, conversationParticipants.profileId)).where(and(eq(conversationParticipants.conversationId, row.conversation.id), ne(conversationParticipants.profileId, profile.id))).limit(1) : Promise.resolve([]),
      db.select({ count: sql<number>`count(*)` }).from(conversationParticipants).where(eq(conversationParticipants.conversationId, row.conversation.id)),
      db.select({ count: sql<number>`count(*)` }).from(conversationMessages).where(and(eq(conversationMessages.conversationId, row.conversation.id), ne(conversationMessages.senderProfileId, profile.id), unreadAfterLastRead)),
    ]);
    const isDirect = row.conversation.conversationType === "direct";
    return { ...row, displayName: isDirect ? otherMember[0]?.fullName || "محادثة فردية" : row.conversation.subject || (row.conversation.conversationType === "department" ? "دردشة القسم" : "مجموعة داخلية"), memberCount: Number(memberCountRows[0]?.count ?? 0), unreadCount: Number(unreadRows[0]?.count ?? 0), lastMessage: lastMessage[0] ?? null, otherMember: otherMember[0] ?? null };
  }));
}

export async function getUnreadConversationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const profile = (await db.select({ id: personProfiles.id }).from(personProfiles).where(eq(personProfiles.userId, userId)).limit(1))[0];
  if (!profile) return 0;
  const rows = await db.select({ count: sql<number>`COUNT(DISTINCT ${conversationMessages.id})` })
    .from(conversationParticipants)
    .innerJoin(conversationMessages, eq(conversationMessages.conversationId, conversationParticipants.conversationId))
    .where(and(
      eq(conversationParticipants.profileId, profile.id),
      sql`${conversationMessages.senderProfileId} <> ${profile.id}`,
      or(isNull(conversationParticipants.lastReadAt), gt(conversationMessages.createdAt, conversationParticipants.lastReadAt)),
    ));
  return Math.max(0, Number(rows[0]?.count ?? 0));
}

export async function getInternalConversation(userId: number, conversationId: number) {
  const { db, profile } = await getActorContext(userId);
  const membership = (await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.profileId, profile.id))).limit(1))[0];
  if (!membership) throw new Error("لا تملك صلاحية فتح هذه المحادثة.");
  const [conversation, messages, participantStates] = await Promise.all([
    db.select().from(internalConversations).where(eq(internalConversations.id, conversationId)).limit(1),
    db.select({ message: conversationMessages, senderName: personProfiles.fullName, attachments: sql<string>`COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id', ${conversationAttachments.id}, 'name', ${conversationAttachments.originalName}, 'url', ${conversationAttachments.storageUrl}, 'storageKey', ${conversationAttachments.storageKey}, 'mimeType', ${conversationAttachments.mimeType})), JSON_ARRAY())` })
      .from(conversationMessages)
      .innerJoin(personProfiles, eq(personProfiles.id, conversationMessages.senderProfileId))
      .leftJoin(conversationAttachments, eq(conversationAttachments.messageId, conversationMessages.id))
      .where(eq(conversationMessages.conversationId, conversationId))
      .groupBy(conversationMessages.id, personProfiles.fullName)
      .orderBy(asc(conversationMessages.createdAt), asc(conversationMessages.id)),
    db.select({ profileId: conversationParticipants.profileId, fullName: personProfiles.fullName, lastReadAt: conversationParticipants.lastReadAt, typingUntil: conversationParticipants.typingUntil })
      .from(conversationParticipants)
      .innerJoin(personProfiles, eq(personProfiles.id, conversationParticipants.profileId))
      .where(eq(conversationParticipants.conversationId, conversationId)),
  ]);
  const messageIds = messages.map((item: any) => item.message.id);
  const rawReactions = messageIds.length ? await db.select({ messageId: conversationMessageReactions.messageId, profileId: conversationMessageReactions.profileId, reaction: conversationMessageReactions.reaction }).from(conversationMessageReactions).where(inArray(conversationMessageReactions.messageId, messageIds)) : [];
  const reactionsByMessage = new Map<number, Array<{ reaction: string; count: number; reactedByMe: boolean }>>();
  for (const row of rawReactions) {
    const grouped = reactionsByMessage.get(row.messageId) ?? [];
    const sameReaction = grouped.find(item => item.reaction === row.reaction);
    if (sameReaction) { sameReaction.count += 1; sameReaction.reactedByMe ||= row.profileId === profile.id; } else grouped.push({ reaction: row.reaction, count: 1, reactedByMe: row.profileId === profile.id });
    reactionsByMessage.set(row.messageId, grouped);
  }
  const referencedMessageIds = Array.from(new Set(messages.map((item: any) => item.message.replyToMessageId).filter((id: number | null) => Boolean(id))));
  const references = referencedMessageIds.length ? await db.select({ id: conversationMessages.id, body: conversationMessages.body, senderName: personProfiles.fullName }).from(conversationMessages).innerJoin(personProfiles, eq(personProfiles.id, conversationMessages.senderProfileId)).where(inArray(conversationMessages.id, referencedMessageIds)) : [];
  const referenceById = new Map(references.map(reference => [reference.id, reference]));
  const hydratedMessages = await Promise.all(messages.map(async (item: any) => {
    const rawAttachments = typeof item.attachments === "string" ? JSON.parse(item.attachments) : item.attachments;
    const attachments = await Promise.all((Array.isArray(rawAttachments) ? rawAttachments : []).filter((attachment: any) => attachment?.id && attachment?.storageKey).map(async (attachment: any) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      url: await storageGetSignedUrl(attachment.storageKey),
    })));
    const readByNames = participantStates.filter(participant => participant.profileId !== item.message.senderProfileId && participant.lastReadAt && participant.lastReadAt >= item.message.createdAt).map(participant => participant.fullName);
    return { ...item, attachments: JSON.stringify(attachments), readByNames, reactions: reactionsByMessage.get(item.message.id) ?? [], repliedTo: item.message.replyToMessageId ? referenceById.get(item.message.replyToMessageId) ?? null : null };
  }));
  const pinnedMessageId = conversation[0]?.pinnedMessageId;
  const pinnedMessage = pinnedMessageId ? (await db.select({ id: conversationMessages.id, body: conversationMessages.body, senderName: personProfiles.fullName, createdAt: conversationMessages.createdAt }).from(conversationMessages).innerJoin(personProfiles, eq(personProfiles.id, conversationMessages.senderProfileId)).where(and(eq(conversationMessages.id, pinnedMessageId), eq(conversationMessages.conversationId, conversationId))).limit(1))[0] ?? null : null;
  await db.update(conversationParticipants).set({ lastReadAt: new Date() }).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.profileId, profile.id)));
  const typingNames = participantStates.filter(participant => participant.profileId !== profile.id && participant.typingUntil && participant.typingUntil > new Date()).map(participant => participant.fullName);
  return { conversation: conversation[0], messages: hydratedMessages, pinnedMessage, typingNames, participantCount: participantStates.length };
}

export function canPinConversationMessage(input: { conversation: { conversationType: string; unitId: number | null; createdByProfileId: number }; profileId: number; roles: Array<{ role: string; unitId: number | null }> }) {
  if (!["department", "custom", "general"].includes(input.conversation.conversationType)) return false;
  if (input.conversation.createdByProfileId === input.profileId) return true;
  if (input.roles.some(role => LEADERSHIP_ROLES.has(role.role))) return true;
  return input.conversation.conversationType === "department" && input.conversation.unitId !== null && canManageUnit(input.roles, input.conversation.unitId);
}

export async function setInternalConversationPinnedMessage(input: { userId: number; conversationId: number; messageId: number | null }) {
  const { db, profile, roles } = await getActorContext(input.userId);
  const membership = (await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, input.conversationId), eq(conversationParticipants.profileId, profile.id))).limit(1))[0];
  if (!membership) throw new Error("لا تملك صلاحية تعديل هذه المحادثة.");
  const conversation = (await db.select().from(internalConversations).where(eq(internalConversations.id, input.conversationId)).limit(1))[0];
  if (!conversation || !canPinConversationMessage({ conversation, profileId: profile.id, roles })) throw new Error("تثبيت الرسائل متاح لمنشئ المجموعة أو مديرها أو القيادة المخولة فقط.");
  if (input.messageId) {
    const message = (await db.select({ id: conversationMessages.id }).from(conversationMessages).where(and(eq(conversationMessages.id, input.messageId), eq(conversationMessages.conversationId, input.conversationId))).limit(1))[0];
    if (!message) throw new Error("لا يمكن تثبيت رسالة من محادثة أخرى.");
  }
  await db.update(internalConversations).set({ pinnedMessageId: input.messageId, pinnedByProfileId: input.messageId ? profile.id : null, pinnedAt: input.messageId ? new Date() : null }).where(eq(internalConversations.id, input.conversationId));
  await logAudit({ actorUserId: input.userId, action: input.messageId ? "internal_conversation.message_pinned" : "internal_conversation.message_unpinned", entityType: "internal_conversation", entityId: input.conversationId, metadata: { messageId: input.messageId } });
  return { success: true };
}

export async function searchInternalConversationMessages(input: { userId: number; conversationId: number; query: string }) {
  const { db, profile } = await getActorContext(input.userId);
  const query = input.query.trim();
  if (query.length < 2) throw new Error("اكتب حرفين على الأقل للبحث داخل المحادثة.");
  const membership = (await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, input.conversationId), eq(conversationParticipants.profileId, profile.id))).limit(1))[0];
  if (!membership) throw new Error("لا تملك صلاحية البحث في هذه المحادثة.");
  const match = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  return db.select({ message: conversationMessages, senderName: personProfiles.fullName, attachmentNames: sql<string>`COALESCE(GROUP_CONCAT(DISTINCT ${conversationAttachments.originalName} SEPARATOR '||'), '')` })
    .from(conversationMessages)
    .innerJoin(personProfiles, eq(personProfiles.id, conversationMessages.senderProfileId))
    .leftJoin(conversationAttachments, eq(conversationAttachments.messageId, conversationMessages.id))
    .where(and(eq(conversationMessages.conversationId, input.conversationId), or(like(conversationMessages.body, match), like(conversationAttachments.originalName, match))))
    .groupBy(conversationMessages.id, personProfiles.fullName)
    .orderBy(desc(conversationMessages.createdAt), desc(conversationMessages.id))
    .limit(50);
}

export async function toggleInternalConversationMessageReaction(input: { userId: number; conversationId: number; messageId: number; reaction: string }) {
  if (!isSupportedInternalMessageReaction(input.reaction)) throw new Error("رمز التفاعل غير مدعوم.");
  const { db, profile } = await getActorContext(input.userId);
  const membership = (await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, input.conversationId), eq(conversationParticipants.profileId, profile.id))).limit(1))[0];
  if (!membership) throw new Error("لا تملك صلاحية التفاعل في هذه المحادثة.");
  const message = (await db.select({ id: conversationMessages.id }).from(conversationMessages).where(and(eq(conversationMessages.id, input.messageId), eq(conversationMessages.conversationId, input.conversationId))).limit(1))[0];
  if (!message) throw new Error("الرسالة غير موجودة في هذه المحادثة.");
  const existing = (await db.select({ id: conversationMessageReactions.id }).from(conversationMessageReactions).where(and(eq(conversationMessageReactions.messageId, input.messageId), eq(conversationMessageReactions.profileId, profile.id), eq(conversationMessageReactions.reaction, input.reaction))).limit(1))[0];
  if (existing) {
    await db.delete(conversationMessageReactions).where(eq(conversationMessageReactions.id, existing.id));
    await logAudit({ actorUserId: input.userId, action: "internal_conversation.reaction_removed", entityType: "conversation_message", entityId: input.messageId, metadata: { conversationId: input.conversationId, reaction: input.reaction } });
    return { active: false };
  }
  await db.insert(conversationMessageReactions).values({ messageId: input.messageId, profileId: profile.id, reaction: input.reaction });
  await logAudit({ actorUserId: input.userId, action: "internal_conversation.reaction_added", entityType: "conversation_message", entityId: input.messageId, metadata: { conversationId: input.conversationId, reaction: input.reaction } });
  return { active: true };
}

export function normalizeConversationBody(body: string, hasAttachments: boolean) {
  const normalized = body.trim();
  if (normalized) return normalized;
  if (hasAttachments) return "مرفق";
  throw new Error("اكتب رسالة أو أرفق ملفاً واحداً على الأقل.");
}

export async function setInternalConversationTyping(input: { userId: number; conversationId: number; isTyping: boolean }) {
  const { db, profile } = await getActorContext(input.userId);
  const membership = (await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, input.conversationId), eq(conversationParticipants.profileId, profile.id))).limit(1))[0];
  if (!membership) throw new Error("لا تملك صلاحية الكتابة في هذه المحادثة.");
  await db.update(conversationParticipants).set({ typingUntil: input.isTyping ? new Date(Date.now() + 8_000) : null }).where(eq(conversationParticipants.id, membership.id));
  return { success: true };
}

export async function sendInternalMessage(input: { userId: number; conversationId: number; body: string; attachments?: Array<{ originalName: string; mimeType: string; contentBase64: string }>; zipAttachments?: Array<{ originalName: string; mimeType: string; contentBase64: string }>; replyToMessageId?: number | null; forwardedFromMessageId?: number | null }) {
  const { db, profile } = await getActorContext(input.userId);
  const membership = (await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, input.conversationId), eq(conversationParticipants.profileId, profile.id))).limit(1))[0];
  if (!membership) throw new Error("لا تملك صلاحية الكتابة في هذه المحادثة.");
  const bundledAttachments = input.zipAttachments?.length ? await packageConversationAttachments({ attachments: input.zipAttachments }) : [];
  const allAttachments = [...(input.attachments ?? []), ...bundledAttachments];
  if (allAttachments.length > ZIP_BATCH_MAX_ITEMS) throw new Error("لا يمكن إرسال أكثر من خمس مرفقات أو حزم في الرسالة الواحدة.");
  if (input.replyToMessageId) {
    const replyTarget = (await db.select({ id: conversationMessages.id }).from(conversationMessages).where(and(eq(conversationMessages.id, input.replyToMessageId), eq(conversationMessages.conversationId, input.conversationId))).limit(1))[0];
    if (!replyTarget) throw new Error("الرسالة المراد الرد عليها غير موجودة في هذه المحادثة.");
  }
  if (input.forwardedFromMessageId) {
    const source = (await db.select({ id: conversationMessages.id, conversationId: conversationMessages.conversationId }).from(conversationMessages).where(eq(conversationMessages.id, input.forwardedFromMessageId)).limit(1))[0];
    const sourceMembership = source ? (await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, source.conversationId), eq(conversationParticipants.profileId, profile.id))).limit(1))[0] : null;
    if (!source || !sourceMembership) throw new Error("لا تملك صلاحية إعادة توجيه هذه الرسالة.");
  }
  // تحقّق من جميع المرفقات قبل إنشاء الرسالة حتى لا تبقى رسالة جزئية عند رفض PDF أو الحجم.
  for (const attachment of input.attachments ?? []) validateConversationAttachment(attachment);
  for (const attachment of bundledAttachments) validateConversationAttachment(attachment, true);
  const normalizedBody = normalizeConversationBody(input.body, Boolean(allAttachments.length));
  const result = await db.insert(conversationMessages).values({ conversationId: input.conversationId, senderProfileId: profile.id, body: normalizedBody, replyToMessageId: input.replyToMessageId ?? null, forwardedFromMessageId: input.forwardedFromMessageId ?? null });
  const messageId = Number(result[0].insertId);
  for (const attachment of input.attachments ?? []) await addConversationAttachment({ db, messageId, profileId: profile.id, attachment });
  for (const attachment of bundledAttachments) await addConversationAttachment({ db, messageId, profileId: profile.id, attachment, allowGeneratedZip: true });
  await db.update(conversationParticipants).set({ typingUntil: null }).where(eq(conversationParticipants.id, membership.id));
  await db.update(internalConversations).set({ updatedAt: new Date() }).where(eq(internalConversations.id, input.conversationId));
  const recipients = await db.select({ profileId: conversationParticipants.profileId }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, input.conversationId), ne(conversationParticipants.profileId, profile.id)));
  const notificationBody = normalizedBody.length > 110 ? `${normalizedBody.slice(0, 107)}…` : normalizedBody;
  await Promise.all(recipients.map(async recipient => {
    try {
      const notification = { profileId: recipient.profileId, category: "chat_message" as const, title: `رسالة جديدة من ${profile.fullName}`, body: notificationBody, dedupeKey: `chat-message-${input.conversationId}-${messageId}-${recipient.profileId}` };
      await db.insert(notifications).values(notification).onDuplicateKeyUpdate({ set: { isRead: false, sentAt: new Date(), body: notificationBody } });
      await sendPushForNotification(recipient.profileId, { title: notification.title, body: notification.body, url: `/messages?conversationId=${input.conversationId}`, tag: notification.dedupeKey });
    } catch (error) { console.warn("[WebPush] فشل إرسال إشعار دردشة دون تعطيل الرسالة", { conversationId: input.conversationId, recipientProfileId: recipient.profileId, error }); }
  }));
  await logAudit({ actorUserId: input.userId, action: "internal_conversation.message_sent", entityType: "conversation_message", entityId: messageId, metadata: { conversationId: input.conversationId, attachmentCount: allAttachments.length, bundledSourceCount: input.zipAttachments?.length ?? 0, recipientCount: recipients.length } });
  return { messageId };
}

export async function forwardInternalConversationMessage(input: { userId: number; sourceMessageId: number; targetConversationId: number; note?: string | null }) {
  const { db, profile } = await getActorContext(input.userId);
  const source = (await db.select({ message: conversationMessages, senderName: personProfiles.fullName }).from(conversationMessages).innerJoin(personProfiles, eq(personProfiles.id, conversationMessages.senderProfileId)).where(eq(conversationMessages.id, input.sourceMessageId)).limit(1))[0];
  if (!source) throw new Error("الرسالة المراد توجيهها غير موجودة.");
  const membership = (await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, source.message.conversationId), eq(conversationParticipants.profileId, profile.id))).limit(1))[0];
  if (!membership) throw new Error("لا تملك صلاحية إعادة توجيه هذه الرسالة.");
  if (source.message.conversationId === input.targetConversationId) throw new Error("اختر محادثة أخرى لإعادة التوجيه.");
  const note = input.note?.trim() ? `${input.note.trim()}\n\n` : "تمت إعادة توجيه رسالة داخلية:\n\n";
  const result = await sendInternalMessage({ userId: input.userId, conversationId: input.targetConversationId, body: `${note}من ${source.senderName}:\n${source.message.body}`.slice(0, 20_000), forwardedFromMessageId: source.message.id });
  await logAudit({ actorUserId: input.userId, action: "internal_conversation.message_forwarded", entityType: "conversation_message", entityId: result.messageId, metadata: { sourceMessageId: source.message.id, targetConversationId: input.targetConversationId, attachmentsForwarded: false } });
  return result;
}

export async function requestUnitDataExport(input: { userId: number; unitId?: number | null }) {
  const { db, profile, roles } = await getActorContext(input.userId);
  const unitId = input.unitId ?? profile.unitId ?? null;
  if (!isManager(roles) || (unitId && !canManageUnit(roles, unitId))) throw new Error("تنزيل بيانات الأقسام متاح للمسؤول المخول على القسم فقط.");
  const result = await db.insert(dataExportJobs).values({ unitId, requestedByUserId: input.userId, status: "queued", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  const jobId = Number(result[0].insertId);
  const archiveProfile = unitId ? (await db.select().from(personProfiles).where(and(eq(personProfiles.unitId, unitId), eq(personProfiles.status, "active"), like(personProfiles.jobTitle, "%أرشيف%"))).limit(1))[0] : undefined;
  if (archiveProfile) {
    await db.update(dataExportJobs).set({ assignedArchiveProfileId: archiveProfile.id }).where(eq(dataExportJobs.id, jobId));
    const taskId = await createTask({ title: `تجهيز حزمة بيانات ${unitId ? `القسم ${unitId}` : "المنصة"}`, ...(unitId == null ? {} : { unitId }), assigneeProfileId: archiveProfile.id, assignedByUserId: input.userId, scheduledFor: new Date(), dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), priority: "high" });
    await logAudit({ actorUserId: input.userId, action: "data_export.requested", entityType: "data_export_job", entityId: jobId, metadata: { archiveProfileId: archiveProfile.id, taskId } });
  }
  return { jobId, status: "queued", assignedArchiveProfileId: archiveProfile?.id ?? null };
}

export async function listDataExportJobs(userId: number) {
  const { db, profile, roles } = await getActorContext(userId);
  if (!isManager(roles)) throw new Error("لا تملك صلاحية عرض عمليات تنزيل البيانات.");
  const unitIds = roles.some(role => LEADERSHIP_ROLES.has(role.role)) ? undefined : roles.filter(role => role.role === "department_manager" && role.unitId).map(role => role.unitId as number);
  const query = unitIds?.length ? db.select().from(dataExportJobs).where(inArray(dataExportJobs.unitId, unitIds)) : db.select().from(dataExportJobs);
  return query.orderBy(desc(dataExportJobs.requestedAt)).limit(100);
}

export async function buildZipArchiveBuffer(entries: Array<{ name: string; content: string | Buffer }>) {
  if (!ZipArchive) throw new Error("تعذر تهيئة محرك ZIP.");
  const chunks: Buffer[] = [];
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const finished = new Promise<void>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve());
    archive.on("error", reject);
  });
  for (const entry of entries) archive.append(entry.content, { name: entry.name });
  archive.finalize();
  await finished;
  return Buffer.concat(chunks);
}

export async function buildUnitDataExport(input: { userId: number; jobId: number }) {
  const { db, profile, roles } = await getActorContext(input.userId);
  const job = (await db.select().from(dataExportJobs).where(eq(dataExportJobs.id, input.jobId)).limit(1))[0];
  if (!job) throw new Error("عملية التصدير غير موجودة.");
  if (!isManager(roles) || (job.unitId && !canManageUnit(roles, job.unitId))) throw new Error("لا تملك صلاحية تنفيذ هذا التصدير.");
  await db.update(dataExportJobs).set({ status: "processing" }).where(eq(dataExportJobs.id, input.jobId));
  try {
    const unitCondition = job.unitId ? eq(personProfiles.unitId, job.unitId) : undefined;
    const [people, unitTasks, docs, correspondenceRows] = await Promise.all([
      unitCondition ? db.select({ profile: personProfiles, unitName: organizationUnits.name }).from(personProfiles).leftJoin(organizationUnits, eq(organizationUnits.id, personProfiles.unitId)).where(unitCondition).limit(10000) : db.select({ profile: personProfiles, unitName: organizationUnits.name }).from(personProfiles).leftJoin(organizationUnits, eq(organizationUnits.id, personProfiles.unitId)).limit(10000),
      job.unitId ? db.select().from(tasks).where(eq(tasks.unitId, job.unitId)).limit(10000) : db.select().from(tasks).limit(10000),
      job.unitId ? db.select({ correspondence: correspondences }).from(correspondences).innerJoin(personProfiles, eq(personProfiles.id, correspondences.senderProfileId)).where(eq(personProfiles.unitId, job.unitId)).limit(10000) : db.select({ correspondence: correspondences }).from(correspondences).limit(10000),
      job.unitId ? db.select({ recipient: correspondenceRecipients }).from(correspondenceRecipients).innerJoin(correspondences, eq(correspondences.id, correspondenceRecipients.correspondenceId)).innerJoin(personProfiles, eq(personProfiles.id, correspondences.senderProfileId)).where(eq(personProfiles.unitId, job.unitId)).limit(10000) : db.select({ recipient: correspondenceRecipients }).from(correspondenceRecipients).limit(10000),
    ]);
    // نحتفظ بقطعة الضغط كما هي بدلاً من نسخها؛ هذا يقلل ذروة الذاكرة في التصديرات الكبيرة.
    const zipBuffer = await buildZipArchiveBuffer([
      { name: "manifest.json", content: JSON.stringify({ exportedAt: new Date().toISOString(), unitId: job.unitId, exportedByProfileId: profile.id }, null, 2) },
      { name: "people.json", content: JSON.stringify(people, null, 2) },
      { name: "tasks.json", content: JSON.stringify(unitTasks, null, 2) },
      { name: "correspondence-recipients.json", content: JSON.stringify(correspondenceRows, null, 2) },
      { name: "correspondences.json", content: JSON.stringify(docs, null, 2) },
    ]);
    const sizeBytes = Number(zipBuffer.byteLength);
    await db.update(dataExportJobs).set({ status: "completed", storageKey: null, storageUrl: null, contentBase64: zipBuffer.toString("base64"), sizeBytes, completedAt: new Date() }).where(eq(dataExportJobs.id, job.id));
    await db.execute(sql`UPDATE data_export_jobs SET sizeBytes = ${sizeBytes} WHERE id = ${job.id}`);
    await logAudit({ actorUserId: input.userId, action: "data_export.completed", entityType: "data_export_job", entityId: job.id, metadata: { unitId: job.unitId, sizeBytes } });
    return { jobId: job.id, status: "completed", url: null, sizeBytes };
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إنشاء حزمة البيانات.";
    await db.update(dataExportJobs).set({ status: "failed", errorMessage: message.slice(0, 500) }).where(eq(dataExportJobs.id, job.id));
    throw new Error("تعذر إنشاء حزمة البيانات؛ سُجلت المشكلة للمراجعة.");
  }
}

export async function listCommunicationUnits() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: organizationUnits.id, name: organizationUnits.name, code: organizationUnits.code }).from(organizationUnits).where(eq(organizationUnits.isActive, true)).orderBy(asc(organizationUnits.name));
}

export async function createFlexibleCorrespondence(input: { userId: number; correspondenceType: "request" | "letter"; participantProfileIds: number[]; subject: string; body: string }) {
  const { db, profile } = await getActorContext(input.userId);
  const recipientIds = Array.from(new Set(input.participantProfileIds)).filter(id => id !== profile.id);
  if (!recipientIds.length) throw new Error("اختر موظفاً واحداً على الأقل.");
  const targets = await db.select().from(personProfiles).where(inArray(personProfiles.id, recipientIds));
  if (targets.length !== recipientIds.length || targets.some(target => target.status !== "active")) throw new Error("أحد المستلمين غير متاح.");
  const now = new Date();
  const taskId = await createTask({ title: `${input.correspondenceType === "request" ? "طلب" : "مراسلة"}: ${input.subject}`, assigneeProfileId: recipientIds[0], unitId: profile.unitId ?? undefined, priority: "normal", scheduledFor: now, dueAt: new Date(now.getTime() + 6 * 60 * 60 * 1000), assignedByUserId: input.userId });
  const result = await db.insert(correspondences).values({ correspondenceType: input.correspondenceType, senderProfileId: profile.id, recipientProfileId: recipientIds[0], subject: input.subject.trim(), body: input.body.trim(), currentLevelId: null, linkedTaskId: taskId, status: "in_review" });
  const correspondenceId = Number(result[0].insertId);
  for (const profileId of recipientIds) {
    await db.insert(correspondenceRecipients).values({ correspondenceId, profileId, recipientType: "direct_recipient" }).onDuplicateKeyUpdate({ set: { isRead: false } });
    await db.insert(notifications).values({ profileId, category: "task_due", title: input.correspondenceType === "request" ? "طلب داخلي جديد" : "مراسلة داخلية جديدة", body: `لديك ${input.correspondenceType === "request" ? "طلب" : "مراسلة"}: ${input.subject}`, dedupeKey: `flexible-correspondence-${correspondenceId}-${profileId}` });
  }
  await db.insert(correspondenceActions).values({ correspondenceId, toLevelId: null, actorUserId: input.userId, action: "created", note: "تواصل مباشر؛ التسلسل الإداري إرشادي وغير ملزم." });
  await logAudit({ actorUserId: input.userId, action: "correspondence.flexible_created", entityType: "correspondence", entityId: correspondenceId, metadata: { taskId, recipientIds, hierarchyEnforced: false } });
  return { id: correspondenceId, taskId };
}
