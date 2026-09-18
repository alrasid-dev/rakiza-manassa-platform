import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { previousReportRange, reportStart } from "../reporting";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { validateSupportAttachments } from "../support-attachment-policy";
import { removePushSubscription, pushReadiness, upsertPushSubscription } from "../push-service";
import {
  acknowledgeTask,
  addCorrespondenceAttachment,
  addTaskAttachment,
  addTaskCommentAndEscalate,
  addTaskComment,
  markTaskAsProcessed,
  reportTaskObstacle,
  addTaskProgressNote,
  extractTaskAttachmentText,
  summarizeTaskAttachmentText,
  translateTaskAttachmentText,
  activateScheduledLeaveStatuses,
  assignCourtRole,
  approveAllPendingApprovals,
  listMyApprovalRequests,
  createManagerAssignmentApproval,
  applyManagerAssignmentApproval,
  createCorrespondence,
  createDecisionCircular,
  createDepartmentAccountDelegation,
  createOperationalReport,
  addMeetingAttendees,
  createMeeting,
  createTasksFromMeetingRecommendations,
  createDelay,
  createSupportTicket,
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
  createDueSoonNotifications,
  createProfile,
  createTask,
  createSelfTask,
  createDepartmentTasks,
  setTaskPinned,
  setTaskNotes,
  createTaskExceptionRequest,
  decideTaskExceptionRequest,
  listTaskExceptionRequestsForManager,
  listTaskAttachments,
  listTaskTimeline,
  listTaskRouteTargets,
  routeTaskToProfile,
  deactivateProfile,
  decideApproval,
  getAccessPermission,
  getActiveCourtRoleAssignments,
  getDashboardSummary,
  getDashboardPreferences,
  getActiveDepartmentIdentityForUser,
  getCorrespondenceById,
  getDepartmentPerformance,
  getDepartmentPerformanceDetails,
  getLeadershipWorkloadObservatory,
  getPerformanceReportEvaluation,
  sendPerformanceRecommendation,
  getManagedUnitDashboard,
  getEffectiveRoles,
  evaluateLoginAllowance,
  getOperationalReport,
  getJudicialFormationReport,
  getPersonalDashboard,
  getProfileById,
  getProfileForUser,
  recordUserActivity,
  getUserEmailSettings,
  recoverUserNotificationEmail,
  getAttendanceConfirmationConfig,
  getAttendanceWindowForProfile,
  setAttendanceConfirmationConfig,
  listWorkShifts,
  updateWorkShift,
  updateUserEmailSettings,
  isOfficialMojEmail,
  isAllowedLoginEmail,
  isPlatformOwnerEmail,
  isAllowedRegistrationEmail,
  getSupportTicketDetail,
  getTaskById,
  getTaskDetails,
  listDelays,
  listDelaysForProfile,
  listDelaysForUnits,
  listAttendance,
  listAttendanceForProfile,
  listActivityLog,
  logAudit,
  listVisibleAnnouncements,
  listAdministrativeSubstitutes,
  listPlatformSubstitutes,
  listAdministrativeLevels,
  listCourtRoleAssignments,
  listCorrespondences,
  listCorrespondenceAttachments,
  listCorrespondencesForProfile,
  listPublishedDecisionsCirculars,
  listMeetings,
  listMeetingAttendees,
  listPlatformModules,
  createPlatformModule,
  updatePlatformModule,
  listImportBatches,
  listImportBatchesForUser,
  listAvailableDepartmentIdentities,
  listDepartmentAccountDelegations,
  listGovernanceArchive,
  linkImportBatchAsTraineeSource,
  listLeaveRequests,
  listLeaveRequestsForProfile,
  listNotificationsForProfile,
  listOrganizationUnits,
  listRemoteAttendanceReport,
  listPlatformUsersForRoleAssignment,
  listPersonalDisciplinaryActions,
  listPendingApprovals,
  listProfiles,
  listProfilesForUnits,
  listTraineesForJudge,
  listProfileDelegations,
  createProfileDelegation,
  updateProfileDelegationStatus,
  listRegistrationRequests,
  listTasks,
  archiveOperationalWork,
  listArchivedOperationalWork,
  restoreArchivedOperationalWork,
  listTasksForProfile,
  listTasksForUnits,
  listTaskTemplatesForUnit,
  listTraineeAttendance,
  listTraineeDelays,
  listTraineeOperations,
  listScoreEvents,
  listScoreEventsForProfile,
  listOperationalReportsForProfile,
  listPerformanceReportEvaluations,
  listSupportTickets,
  markDecisionCircularRead,
  markNotificationRead,
  publishDecisionCircular,
  saveMeetingMinutes,
  updateMeetingAttendee,
  recordScoreEvent,
  reviewPerformanceReportEvaluation,
  recordAttendance,
  recordAttendanceCheckout,
  notifyPlatformOwnerSecurityAlert,
  renewTraineeAssignment,
  resolveSupportTicket,
  revokeCourtRole,
  listDepartmentManagerAssignments,
  assignDepartmentManager,
  endDepartmentManagerAssignment,
  listDepartmentTaskTemplates,
  getTaskTemplateUnitId,
  setDepartmentTaskTemplateActive,
  listDepartmentDocuments,
  createDepartmentDocument,
  endDepartmentAccountDelegation,
  reviewRegistrationRequest,
  reviewLeaveRequest,
  routeCorrespondence,
  saveImportBatch,
  saveAdministrativeLevel,
  setTraineeAssignment,
  submitRegistrationRequest,
  submitLeaveRequest,
  switchActiveDepartmentIdentity,
  submitTaskForReview,
  addSupportTicketComment,
  updateJudgeProfile,
  updateOperationalProfile,
  updateDashboardPreferences,
  updateTaskStatus,
  requestOtpCode,
  verifyOtpCode,
  issueAuthActivationToken,
  consumeAuthActivationToken,
  DASHBOARD_NAVIGATION_LABELS,
  DASHBOARD_WIDGET_IDS,
  DASHBOARD_QUICK_ACTION_IDS,
  DASHBOARD_HOME_CARD_IDS,
} from "../court-service";
import { beginPasskeyRegistration, finishPasskeyRegistration, beginPasskeyAuthentication, finishPasskeyAuthentication } from "../webauthn-service";
import { ensureAttendanceConfirmationHeartbeatJob, ensureCoreHeartbeatJobs } from "../scheduled/core-jobs";
import { ensureInternalMailDispatchHeartbeatJob } from "../scheduled/internal-mail-setup";
import { parse as parseCookie } from "cookie";
import { canPerform, canViewWholePlatform, isSelfWorkspacePermission, type AppPermission, type ProtectedAction } from "../access-control";
import { canActOnApproval, canActOnManagerAssignmentApproval, canManageOperations, nextApprovalRole, nextManagerAssignmentApprovalRole, type ApprovalRole, type ManagerAssignmentApprovalRole } from "../court-workflow";
import { analyzeExcelImport, suggestImportAction } from "../import-validator";
import { calculateWeightedPerformance, evaluatePerformance } from "../performance-evaluation";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { askSectionAssistant, canUseSectionAssistant, SECTION_ASSISTANTS, type SectionAssistantKey } from "../section-assistants";
import { listManagerDecisionPatterns, recordManagerDecision, revokeAutomationDecision } from "../assistant-learning-service";
import { predictForManager } from "../assistant-predictions";
import { evaluateAutoApproval } from "../assistant-auto-approval";
import { notifyOwner } from "../_core/notification";
import { ENV } from "../_core/env";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { assignCourtAsset, canClearProfile, countOpenCustodies, createCourtAsset, listCourtAssets, returnCourtAsset } from "../assets-service";
import { archiveManagerTemplate, buildUnitDataExport, createFlexibleCorrespondence, createCustomConversation, createInternalConversation, createManagerTemplate, forwardInternalConversationMessage, getInternalConversation, getUnreadConversationCount, listCommunicationUnits, listDataExportJobs, listFrequentContacts, listInternalConversations, listManagerTemplates, requestUnitDataExport, searchInternalConversationMessages, searchInternalPeople, sendInternalMessage, setInternalConversationPinnedMessage, setInternalConversationTyping, toggleInternalConversationMessageReaction, updateManagerTemplate } from "../internal-communications-service";
import { departmentAccounts } from "../../drizzle/schema";
import { sendPushForNotification } from "../push-service";
import { deleteInternalMailRule, deleteInternalMailTemplate, getInternalMailFolderCounts, getInternalMailMessage, getInternalMailPreferences, listInternalMail, listInternalMailRecurringSchedules, saveInternalMailDraft, saveInternalMailRule, saveInternalMailTemplate, scheduleInternalMail, scheduleRecurringInternalMail, sendInternalMail, suggestInternalMailAssistant, summarizeInternalMailMessage, updateInternalMailAssistantPreferences, updateInternalMailContact, updateInternalMailEntry, updateInternalMailPreferences, updateInternalMailRecurringSchedule, uploadInternalMailSignatureImage } from "../internal-mail-service";
import { removeFcmToken, sendFcmToProfile, upsertFcmToken } from "../fcm-service";
import { clearMustChangePassword, linkFirebaseIdentity, verifyFirebaseIdToken } from "../firebase-auth-service";
import { loginWithPasscode, passcodeConfigured, setupPasscode } from "../passcode-service";
import { getDb } from "../db";
import {
  cancelPermissionDelegation,
  createPermissionDelegation,
  getOwnerLeadershipKpis,
  getWorkPreferences,
  globalSearch,
  listOrganizationUnitsIncludingArchived,
  listPermissionDelegations,
  passkeyEnrollmentStatus,
  requestOtpByPhone,
  setOrganizationUnitActive,
  updateWorkPreferences,
} from "../platform-completion-service";
import { summarizeAttendanceRecords } from "../platform-completion";
import { analyzeWorkflowDocument, distributeWorkflowSteps, listWorkflowStaff } from "../workflow-map-service";

function requestOrigin(req: { protocol: string; get(name: string): string | undefined }) {
  const protocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  return host ? `${protocol}://${host}` : undefined;
}

async function rolesForUser(user: { id: number; role: "user" | "admin" }) {
  return getEffectiveRoles(user.id, user.role === "admin");
}

async function requireOperationsManager(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await permissionForUser(user);
  const roles = await rolesForUser(user);
  if (permission !== "full_control" && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك الصلاحية الإدارية اللازمة لهذا الإجراء." });
  return roles;
}

async function requireHumanResourcesOrLeadership(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await permissionForUser(user);
  const roles = await rolesForUser(user);
  const allowed = canViewWholePlatform(permission) || roles.some(role => ["court_president", "assistant_president", "court_secretary", "human_resources_manager"].includes(role));
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "إدارة ملفات موظفي المحكمة متاحة للموارد البشرية والقيادة المخولة فقط." });
  return { permission, roles };
}

async function requireAttendancePolicyAccess(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await permissionForUser(user);
  const roles = await rolesForUser(user);
  const allowed = canViewWholePlatform(permission) || roles.some(role => ["court_president", "court_secretary", "human_resources_manager"].includes(role));
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "إعداد تأكيد الحضور متاح للرئيس والأمين والموارد البشرية فقط." });
  return { permission, roles };
}

function isTruePlatformOwner(user: { email: string | null }) {
  return isPlatformOwnerEmail(user.email);
}

async function requirePlatformOwner(user: { id: number; role: "user" | "admin"; email: string | null }) {
  if (!isTruePlatformOwner(user)) throw new TRPCError({ code: "FORBIDDEN", message: "هذا الإجراء متاح لمالك المنصة فقط." });
}

/** صلاحية إدارة تكليف المدراء: متاحة للمالك ورئيس المحكمة والأمين العام (الأمين العام = court_secretary). */
async function requireManagerDelegationAuthority(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await permissionForUser(user);
  const roles = await rolesForUser(user);
  const allowed = permission === "full_control" || roles.some(role => role === "court_president" || role === "court_secretary");
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "إدارة تكليف المدراء متاحة للمالك ورئيس المحكمة والأمين العام فقط." });
}

/** وحدات قوالب المهام التي يحق للمستخدم إدارتها (القيادة: كل الوحدات، المدير: وحدته). */
async function manageableTemplateUnitIds(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await permissionForUser(user);
  const roles = await rolesForUser(user);
  const isLeadership = permission === "full_control" || roles.some(role => role === "court_president" || role === "court_secretary");
  if (isLeadership) return (await listOrganizationUnits()).map(unit => unit.id);
  const managedUnits = await managedUnitIdsForUser(user);
  if (!managedUnits.length) throw new TRPCError({ code: "FORBIDDEN", message: "قوالب مهام الأقسام متاحة للقيادة ومديري الأقسام فقط." });
  return managedUnits;
}

async function permissionForUser(user: { id: number; role: "user" | "admin"; email: string | null }): Promise<AppPermission> {
  if (user.role === "admin") return "full_control";
  if (user.email?.trim().toLowerCase() === ENV.platformOwnerEmail) return "full_control";
  return getAccessPermission(user.email);
}

/** نطاق وحدات مخطط سير العمل: القيادة كل الوحدات، ومدير القسم وحداته فقط. */
async function workflowMapUnitIds(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await permissionForUser(user);
  const roles = await rolesForUser(user);
  const isLeadership = permission === "full_control" || roles.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary");
  if (isLeadership) return (await listOrganizationUnits()).map(unit => unit.id);
  const managedUnits = await managedUnitIdsForUser(user);
  if (!managedUnits.length) throw new TRPCError({ code: "FORBIDDEN", message: "مخطط سير العمل متاح للقيادة ومديري الأقسام فقط." });
  return managedUnits;
}

async function requirePermission(user: { id: number; role: "user" | "admin"; email: string | null }, action: ProtectedAction) {
  const permission = await permissionForUser(user);
  if (!canPerform(permission, action)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك الصلاحية المطلوبة لهذا الإجراء." });
  return permission;
}

async function requirePersonalWorkspace(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await requirePermission(user, "view");
  const profile = await getProfileForUser(user.id);
  if (!profile || !isSelfWorkspacePermission(permission)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يتوفر ملف شخصي مؤهل لمساحة العمل الخاصة." });
  if (permission === "employee" && profile.personType !== "administrative") throw new TRPCError({ code: "FORBIDDEN", message: "يتطلب دور الموظف الإداري ملفاً إدارياً مرتبطاً بالحساب." });
  if (permission === "trainee" && profile.personType !== "trainee") throw new TRPCError({ code: "FORBIDDEN", message: "يتطلب دور الملازم القضائي ملف ملازم مرتبطاً بالحساب." });
  return { permission, profile };
}

async function requireSelfAttendanceProfile(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await requirePermission(user, "view");
  const profile = await getProfileForUser(user.id);
  if (!profile || !isSelfWorkspacePermission(permission)) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف شخصي مؤهل لعرض سجل الحضور." });
  return { permission, profile };
}

async function requirePlatformView(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await requirePermission(user, "view");
  const roles = await rolesForUser(user);
  if (!await hasLeadershipPlatformScope(user, permission)) throw new TRPCError({ code: "FORBIDDEN", message: "هذه البيانات متاحة فقط للقيادة المخولة أو لصلاحية الاطلاع الشامل." });
  return permission;
}

async function hasLeadershipPlatformScope(user: { id: number; role: "user" | "admin" }, permission: AppPermission) {
  if (canViewWholePlatform(permission)) return true;
  const roles = await rolesForUser(user);
  return roles.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary");
}

async function requireLeadershipWorkloadObservatoryAccess(user: { id: number; role: "user" | "admin"; email: string | null }) {
  const permission = await permissionForUser(user);
  if (permission === "full_control") return;
  const roles = await rolesForUser(user);
  if (!roles.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary")) throw new TRPCError({ code: "FORBIDDEN", message: "مرصد ضغط العمل متاح للمالك ورئيس المحكمة والأمين ومساعد الرئيس فقط." });
}

async function managedUnitIdsForUser(user: { id: number; role: "user" | "admin"; email?: string | null }) {
  const assignments = await getActiveCourtRoleAssignments(user.id, user.role === "admin");
  const managed = assignments.filter(assignment => (assignment.role === "trainee_affairs_manager" || assignment.role === "department_manager") && assignment.unitId !== null).map(assignment => assignment.unitId!);
  const db = await getDb();
  if (db) {
    const accountIdentity = user.email?.trim().toLowerCase();
    const identityMatch = accountIdentity ? or(eq(departmentAccounts.userId, user.id), sql`LOWER(${departmentAccounts.loginEmail}) = ${accountIdentity}`) : eq(departmentAccounts.userId, user.id);
    const department = (await db.select({ unitId: departmentAccounts.unitId }).from(departmentAccounts).where(and(identityMatch, eq(departmentAccounts.isActive, true))).limit(1))[0];
    if (department?.unitId && !managed.includes(department.unitId)) managed.push(department.unitId);
  }
  return managed;
}

async function requireAssetClearance(profileId: number) {
  const openCustodyCount = await countOpenCustodies(profileId);
  if (!canClearProfile(openCustodyCount)) throw new TRPCError({ code: "CONFLICT", message: `لا يمكن نقل أو إنهاء الملف قبل إخلاء العهد المفتوحة (${openCustodyCount}).` });
}

async function requireSupportTicketAccess(user: { id: number; role: "user" | "admin"; email: string | null }, ticketId: number) {
  await requirePermission(user, "view");
  const profile = await getProfileForUser(user.id);
  if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف شخصي لاستخدام الدعم التقني." });
  const detail = await getSupportTicketDetail(ticketId);
  if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "تذكرة الدعم غير موجودة." });
  const roles = await rolesForUser(user);
  const isLeadership = user.role === "admin" || roles.some(role => role === "court_president" || role === "assistant_president" || role === "technical_support_manager");
  const isAssignedAgent = roles.includes("technical_support_agent") && detail.ticket.assignedSupportProfileId === profile.id;
  const isRequester = detail.ticket.requesterProfileId === profile.id;
  if (!isLeadership && !isAssignedAgent && !isRequester) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الاطلاع على هذه التذكرة." });
  return { profile, roles, detail, isLeadership, isAssignedAgent, isRequester };
}

export const courtRouter = router({
  departmentIdentity: router({
    manageableAccounts: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      const db = await getDb();
      if (!db) return [];
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return db.select().from(departmentAccounts).where(eq(departmentAccounts.isActive, true));
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      return managedUnitIds.length ? db.select().from(departmentAccounts).where(and(eq(departmentAccounts.isActive, true), inArray(departmentAccounts.unitId, managedUnitIds))) : [];
    }),
    available: protectedProcedure.query(async ({ ctx }) => {
      const identities = await listAvailableDepartmentIdentities(ctx.user.id);
      const active = await getActiveDepartmentIdentityForUser(ctx.user.id);
      return { activeAccountId: active?.account.id ?? null, identities: identities.map(item => ({ account: item.account, delegation: item.delegation })) };
    }),
    switch: protectedProcedure.input(z.object({ departmentAccountId: z.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => switchActiveDepartmentIdentity({ userId: ctx.user.id, departmentAccountId: input.departmentAccountId })),
    listDelegations: protectedProcedure.input(z.object({ departmentAccountId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      const db = await getDb();
      const [account] = db ? await db.select({ unitId: departmentAccounts.unitId }).from(departmentAccounts).where(eq(departmentAccounts.id, input.departmentAccountId)).limit(1) : [];
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "حساب القسم غير موجود." });
      if (!await hasLeadershipPlatformScope(ctx.user, permission) && !(await managedUnitIdsForUser(ctx.user)).includes(account.unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك الاطلاع على تكليفات حساب قسم خارج نطاقك." });
      return listDepartmentAccountDelegations(input.departmentAccountId);
    }),
    createDelegation: protectedProcedure.input(z.object({ departmentAccountId: z.number().int().positive(), delegateUserId: z.number().int().positive(), startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable().optional(), notes: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      const db = await getDb();
      const [account] = db ? await db.select({ unitId: departmentAccounts.unitId }).from(departmentAccounts).where(eq(departmentAccounts.id, input.departmentAccountId)).limit(1) : [];
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "حساب القسم غير موجود." });
      if (!await hasLeadershipPlatformScope(ctx.user, await permissionForUser(ctx.user)) && !(await managedUnitIdsForUser(ctx.user)).includes(account.unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تفويض حساب قسم خارج نطاقك." });
      return { id: await createDepartmentAccountDelegation({ ...input, createdByUserId: ctx.user.id }) };
    }),
    endDelegation: protectedProcedure.input(z.object({ delegationId: z.number().int().positive(), departmentAccountId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      const db = await getDb();
      const [account] = db ? await db.select({ unitId: departmentAccounts.unitId }).from(departmentAccounts).where(eq(departmentAccounts.id, input.departmentAccountId)).limit(1) : [];
      if (!account || (!await hasLeadershipPlatformScope(ctx.user, await permissionForUser(ctx.user)) && !(await managedUnitIdsForUser(ctx.user)).includes(account.unitId))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك إنهاء هذا التكليف." });
      return endDepartmentAccountDelegation({ delegationId: input.delegationId, actorUserId: ctx.user.id });
    }),
  }),
  assets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      const profile = await getProfileForUser(ctx.user.id);
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listCourtAssets();
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (managedUnitIds.length) return listCourtAssets({ unitId: managedUnitIds[0] });
      if (profile) return listCourtAssets({ profileId: profile.id });
      throw new TRPCError({ code: "FORBIDDEN", message: "لا يتوفر نطاق لعرض العهد." });
    }),
    create: protectedProcedure.input(z.object({ assetNumber: z.string().trim().min(2).max(100), assetType: z.enum(["computer", "phone", "screen", "printer", "seal", "other"]), name: z.string().trim().min(2).max(255), serialNumber: z.string().trim().max(160).optional(), unitId: z.number().int().positive().nullable().optional(), notes: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      return { id: await createCourtAsset({ ...input, createdByUserId: ctx.user.id }) };
    }),
    assign: protectedProcedure.input(z.object({ assetId: z.number().int().positive(), profileId: z.number().int().positive(), notes: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "edit");
      if (!await hasLeadershipPlatformScope(ctx.user, permission)) {
        const managedUnitIds = await managedUnitIdsForUser(ctx.user);
        const profile = await getProfileById(input.profileId);
        if (!profile?.unitId || !managedUnitIds.includes(profile.unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك إسناد عهدة خارج نطاق وحدتك." });
      }
      return { id: await assignCourtAsset({ ...input, actorUserId: ctx.user.id }) };
    }),
    return: protectedProcedure.input(z.object({ custodyId: z.number().int().positive(), returnCondition: z.string().trim().max(255).optional(), notes: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "edit");
      if (!await hasLeadershipPlatformScope(ctx.user, permission)) throw new TRPCError({ code: "FORBIDDEN", message: "استرداد العهد متاح للقيادة أو المفوض الإداري." });
      return returnCourtAsset({ ...input, actorUserId: ctx.user.id });
    }),
    clearance: protectedProcedure.input(z.object({ profileId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      const profile = await getProfileForUser(ctx.user.id);
      const isSelf = profile?.id === input.profileId;
      if (!isSelf && !await hasLeadershipPlatformScope(ctx.user, permission)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض إخلاء ملف آخر." });
      const openCustodyCount = await countOpenCustodies(input.profileId);
      return { profileId: input.profileId, openCustodyCount, clear: canClearProfile(openCustodyCount) };
    }),
  }),
  assistants: router({
    catalog: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      const roles = await rolesForUser(ctx.user);
      const isLeadership = await hasLeadershipPlatformScope(ctx.user, permission);
      const profile = await getProfileForUser(ctx.user.id);
      const unit = profile?.unitId ? (await listOrganizationUnits()).find(item => item.id === profile.unitId) : null;
      const unitText = `${unit?.code ?? ""} ${unit?.name ?? ""}`.toLowerCase();
      const unitAllows = (key: string) => key === "department" || isLeadership || permission === "full_control" || (key === "trainee_affairs" && /ملازم|trainee/.test(unitText)) || (key === "judicial_affairs" && /قاض|قضا|judge/.test(unitText)) || (key === "technical_support" && /دعم|تقني|technical/.test(unitText));
      const canManageAutomation = permission === "full_control" || canManageOperations(roles);
      return Object.entries(SECTION_ASSISTANTS)
        .filter(([key]) => canUseSectionAssistant(key as SectionAssistantKey, permission as "full_control" | "general_view" | "employee" | "trainee", isLeadership) && unitAllows(key))
        .map(([key, value]) => ({
          key,
          label: key === "department" && unit?.name ? `مساعد ${unit.name}` : value.label,
          description: key === "department" && unit?.name
            ? `مساعد عملي لمهام ${unit.name} ومراسلاته وتنبيهاته ضمن ما تسمح به صلاحية المستخدم.`
            : value.description,
          canManageAutomation,
        }));
    }),
    recordManagerDecision: protectedProcedure.input(z.object({ assistant: z.enum(["department", "leadership", "trainee_affairs", "judicial_affairs", "performance_monitoring", "technical_support"]), decisionType: z.enum(["task_route", "priority", "summary_ack", "recommendation_accept", "recommendation_reject"]), decision: z.enum(["accepted", "rejected", "modified"]), contextLabel: z.string().trim().min(2).max(240), outcomeLabel: z.string().trim().max(240).optional(), rationale: z.string().trim().max(1000).optional(), automationMode: z.enum(["full", "partial", "disabled"]).optional() })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      await recordManagerDecision({ ...input, managerUserId: ctx.user.id });
      const notificationSent = await notifyOwner({ title: "اختيار وضع معالجة في رَكيزة", content: `سُجل اختيار المدير لوضع «${input.automationMode ?? "غير محدد"}» للمساعد «${input.assistant}»، دون تنفيذ تلقائي.` });
      return { success: true, notificationSent };
    }),
    revokeAutomation: protectedProcedure.input(z.object({ assistant: z.enum(["department", "leadership", "trainee_affairs", "judicial_affairs", "performance_monitoring", "technical_support"]), decisionType: z.enum(["task_route", "priority", "summary_ack", "recommendation_accept", "recommendation_reject"]), contextLabel: z.string().trim().min(2).max(240), rationale: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      const result = await revokeAutomationDecision({ ...input, managerUserId: ctx.user.id });
      const notificationSent = await notifyOwner({ title: "إلغاء فوري للموافقة الآلية", content: `ألغى المدير الموافقة الآلية للمساعد ${input.assistant}، وبقي التنفيذ متوقفاً حتى اعتماد جديد.` });
      return { ...result, notificationSent };
    }),
    managerPatterns: protectedProcedure.input(z.object({ assistant: z.string().trim().max(80).optional(), limit: z.number().int().min(1).max(100).optional() }).optional()).query(async ({ ctx, input }) => {
      await requirePlatformView(ctx.user);
      return listManagerDecisionPatterns(input);
    }),
    autoApprovalPreview: protectedProcedure.input(z.object({ actionType: z.string().trim().min(2).max(80), confidence: z.number().min(0).max(1), sampleSize: z.number().int().min(0).max(10000) })).query(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      return evaluateAutoApproval(input);
    }),
    predict: protectedProcedure.input(z.object({ assistant: z.enum(["department", "leadership", "trainee_affairs", "judicial_affairs", "performance_monitoring", "technical_support"]), taskSnapshot: z.string().trim().min(2).max(10000), actionType: z.enum(["task_route", "priority", "summary_ack", "recommendation_accept", "recommendation_reject", "penalty", "employment_decision", "sensitive_correspondence", "permission_change"]).optional() })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      const result = await predictForManager(input);
      await logAudit({ actorUserId: ctx.user.id, action: "assistant.prediction.generated", entityType: "assistant_prediction", metadata: { assistant: input.assistant, actionType: input.actionType ?? null, forecastCount: result.forecasts.length, optionCount: result.rankedOptions.length, autoApprovalEligible: result.autoApproval.eligible } });
      return result;
    }),
    chat: protectedProcedure.input(z.object({ assistant: z.enum(["department", "leadership", "trainee_affairs", "judicial_affairs", "performance_monitoring", "technical_support"]), message: z.string().trim().min(2).max(4000), pageContext: z.string().trim().max(6000).optional() })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      const isLeadership = await hasLeadershipPlatformScope(ctx.user, permission);
      const profile = await getProfileForUser(ctx.user.id);
      const unit = profile?.unitId ? (await listOrganizationUnits()).find(item => item.id === profile.unitId) : null;
      const unitText = `${unit?.code ?? ""} ${unit?.name ?? ""}`.toLowerCase();
      const unitAllows = input.assistant === "department" || isLeadership || permission === "full_control" || (input.assistant === "trainee_affairs" && /ملازم|trainee/.test(unitText)) || (input.assistant === "judicial_affairs" && /قاض|قضا|judge/.test(unitText)) || (input.assistant === "technical_support" && /دعم|تقني|technical/.test(unitText));
      if (!canUseSectionAssistant(input.assistant, permission as "full_control" | "general_view" | "employee" | "trainee", isLeadership) || !unitAllows) throw new TRPCError({ code: "FORBIDDEN", message: "لا يملك حسابك صلاحية استخدام مساعد هذا القسم." });
      const answer = await askSectionAssistant({ assistant: input.assistant, audience: permission as "full_control" | "general_view" | "employee" | "trainee", userMessage: input.message, pageContext: input.pageContext });
      await logAudit({ actorUserId: ctx.user.id, action: "assistant.response.generated", entityType: "section_assistant", metadata: { assistant: input.assistant, messageLength: input.message.length, sources: input.pageContext ? ["page_context"] : [], humanReviewRequired: true } });
      return { answer, assistant: input.assistant, sources: input.pageContext ? ["سياق الصفحة المرسل من المستخدم"] : [], humanReviewRequired: true };
    }),
  }),

  firebaseAuth: router({
    issueActivation: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await issueAuthActivationToken({ userId: ctx.user.id });
      return { ...result, message: "رمز التفعيل صالح لمدة 10 دقائق ولمرة واحدة فقط." };
    }),
    exchange: publicProcedure.input(z.object({ idToken: z.string().min(200).max(20000), activationToken: z.string().min(20).max(200).optional(), completePasswordSetup: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      try {
        const identity = await verifyFirebaseIdToken(input.idToken, { allowUnverifiedEmail: Boolean(input.activationToken) });
        if (input.activationToken) {
          if (!ctx.user || ctx.user.email?.trim().toLowerCase() !== identity.email) throw new Error("يجب إصدار رمز التفعيل بعد إثبات هويتك بـOTP أو مفتاح المرور، وبنفس البريد الرسمي.");
          await consumeAuthActivationToken({ userId: ctx.user.id, token: input.activationToken });
        }
        const linked = await linkFirebaseIdentity(identity);
        if (input.activationToken || input.completePasswordSetup) await clearMustChangePassword(linked.user.id);
        const sessionToken = await sdk.createSessionToken(linked.user.openId, { name: linked.user.name ?? identity.name, expiresInMs: ONE_YEAR_MS });
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        const mustChangePassword = Boolean((linked.user as { mustChangePassword?: boolean }).mustChangePassword) && !(input.activationToken || input.completePasswordSetup);
        return { verified: true as const, provider: identity.provider, mustChangePassword };
      } catch (error) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "تعذر ربط مصادقة Firebase بالحساب." });
      }
    }),
    completePasswordSetup: protectedProcedure.mutation(async ({ ctx }) => {
      await clearMustChangePassword(ctx.user.id);
      return { success: true as const, mustChangePassword: false as const };
    }),
  }),
  otp: router({
    request: publicProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320).refine(value => isAllowedLoginEmail(value), "استخدم البريد الرسمي أو بريد مالك رَكيزة المهيأ.") })).mutation(async ({ ctx, input }) => {
      try {
        return await requestOtpCode({ officialEmail: input.officialEmail, requestIp: ctx.req.ip });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر إرسال رمز التحقق." });
      }
    }),
    requestByPhone: publicProcedure.input(z.object({ phone: z.string().trim().min(9).max(20) })).mutation(async ({ ctx, input }) => {
      try {
        return await requestOtpByPhone({ phone: input.phone, requestIp: ctx.req.ip });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر إرسال رمز التحقق عبر الجوال." });
      }
    }),
    verify: publicProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320), code: z.string().regex(/^\d{6}$/, "يجب إدخال ستة أرقام.") })).mutation(async ({ ctx, input }) => {
      const result = await verifyOtpCode(input);
      if (!result.verified) return result;
      if (!result.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "الحساب غير موجود." });
      const sessionToken = await sdk.createSessionToken(result.user.openId, { name: result.user.name ?? "", expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { verified: true as const, mustChangePassword: Boolean((result.user as { mustChangePassword?: boolean }).mustChangePassword) };
    }),
  }),

  passcode: router({
    isConfigured: publicProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320) })).query(({ input }) => passcodeConfigured({ officialEmail: input.officialEmail })),
    setup: publicProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320), passcode: z.string().regex(/^\d{6}$/, "يجب إدخال ستة أرقام.") })).mutation(async ({ ctx, input }) => {
      try {
        const user = await setupPasscode({ officialEmail: input.officialEmail, passcode: input.passcode });
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? "", expiresInMs: ONE_YEAR_MS });
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return { verified: true as const, configured: true as const };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر إنشاء رمز المرور." });
      }
    }),
    login: publicProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320), passcode: z.string().regex(/^\d{6}$/, "يجب إدخال ستة أرقام.") })).mutation(async ({ ctx, input }) => {
      try {
        const user = await loginWithPasscode({ officialEmail: input.officialEmail, passcode: input.passcode });
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? "", expiresInMs: ONE_YEAR_MS });
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return { verified: true as const };
      } catch (error) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "تعذر الدخول برمز المرور." });
      }
    }),
  }),

  scheduled: router({
    ensureCoreJobs: protectedProcedure.mutation(async ({ ctx }) => {
      await requirePlatformOwner(ctx.user);
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      if (!sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "جلسة المالك غير متاحة لتهيئة الجدولة." });
      return ensureCoreHeartbeatJobs({ userSession: sessionToken });
    }),
  }),

  passkey: router({
    beginRegistration: protectedProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320) })).mutation(({ ctx, input }) => beginPasskeyRegistration({ userId: ctx.user.id, officialEmail: input.officialEmail, origin: requestOrigin(ctx.req) })),
    finishRegistration: protectedProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320), response: z.any() })).mutation(({ ctx, input }) => finishPasskeyRegistration({ userId: ctx.user.id, officialEmail: input.officialEmail, response: input.response, origin: requestOrigin(ctx.req) })),
    beginAuthentication: publicProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320) })).mutation(({ ctx, input }) => beginPasskeyAuthentication({ ...input, origin: requestOrigin(ctx.req) })),
    finishAuthentication: publicProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320), response: z.any() })).mutation(async ({ ctx, input }) => {
      const result = await finishPasskeyAuthentication({ ...input, origin: requestOrigin(ctx.req) });
      if (!result.verified) return result;
      const sessionToken = await sdk.createSessionToken(result.user.openId, { name: result.user.name ?? "", expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return { verified: true as const };
    }),
    enrollmentStatus: protectedProcedure.query(async ({ ctx }) => passkeyEnrollmentStatus(ctx.user.id)),
  }),

  registration: router({
    submit: publicProcedure.input(z.object({ fullName: z.string().trim().min(12).max(240), officialEmail: z.string().trim().email().max(320).refine(value => isAllowedRegistrationEmail(value), "يجب استخدام البريد الرسمي المنتهي بـ moj.gov.sa أو البريد المصرح به لمالك رَكيزة."), notificationEmail: z.string().trim().email().max(320), phone: z.string().trim().max(40).optional(), privacyNoticeVersion: z.string().trim().min(1).max(40), privacyAcknowledged: z.literal(true) })).mutation(({ input }) => submitRegistrationRequest(input)),
    list: protectedProcedure.query(async ({ ctx }) => {
      await requirePermission(ctx.user, "manage_access");
      return listRegistrationRequests();
    }),
    review: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), permission: z.enum(["full_control", "general_view", "employee", "trainee"]).optional(), note: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "manage_access");
      if (input.permission === "full_control" && !isTruePlatformOwner(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "التفويض البرمجي (تحكم كامل) متاح لمالك المنصة فقط." });
      await reviewRegistrationRequest({ ...input, reviewedByUserId: ctx.user.id });
      return { success: true };
    }),
    myPermission: protectedProcedure.query(({ ctx }) => permissionForUser(ctx.user)),
  }),

  accountRecovery: router({
    recoverNotificationEmail: protectedProcedure.input(z.object({ officialEmail: z.string().trim().email().max(320), notificationEmail: z.string().trim().email().max(320), reason: z.string().trim().min(5).max(1000) })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      try {
        return await recoverUserNotificationEmail({ ...input, actorUserId: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر استعادة قناة التنبيهات." });
      }
    }),
  }),

  emailSettings: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getUserEmailSettings(ctx.user.id);
      if (!settings) throw new TRPCError({ code: "NOT_FOUND", message: "إعدادات الحساب غير موجودة." });
      return { officialEmail: settings.officialEmail, notificationEmail: settings.backupEmail, notificationEmailVerifiedAt: settings.backupEmailVerifiedAt, notificationPreference: settings.emailNotificationPreference ?? "work", officialEmailIsValid: Boolean(settings.officialEmail && isAllowedLoginEmail(settings.officialEmail)) };
    }),
    update: protectedProcedure.input(z.object({ notificationEmail: z.string().trim().email().max(320).nullable(), notificationPreference: z.enum(["work", "backup", "both"]).optional() })).mutation(async ({ ctx, input }) => {
      try {
        return await updateUserEmailSettings({ userId: ctx.user.id, backupEmail: input.notificationEmail, emailNotificationPreference: input.notificationPreference });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر حفظ إعدادات البريد." });
      }
    }),
  }),

  dashboardPreferences: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await getDashboardPreferences(ctx.user.id);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر تحميل تفضيلات لوحة القيادة." });
      }
    }),
    update: protectedProcedure.input(z.object({
      widgetOrder: z.array(z.enum(DASHBOARD_WIDGET_IDS)).max(DASHBOARD_WIDGET_IDS.length),
      hiddenWidgetIds: z.array(z.enum(DASHBOARD_WIDGET_IDS)).max(DASHBOARD_WIDGET_IDS.length),
      quickActionOrder: z.array(z.enum(DASHBOARD_QUICK_ACTION_IDS)).max(DASHBOARD_QUICK_ACTION_IDS.length),
      hiddenQuickActionIds: z.array(z.enum(DASHBOARD_QUICK_ACTION_IDS)).max(DASHBOARD_QUICK_ACTION_IDS.length),
      navigationOrder: z.array(z.enum(DASHBOARD_NAVIGATION_LABELS)).max(DASHBOARD_NAVIGATION_LABELS.length),
      hiddenNavigationLabels: z.array(z.enum(DASHBOARD_NAVIGATION_LABELS)).max(DASHBOARD_NAVIGATION_LABELS.length),
      homeCardOrder: z.array(z.enum(DASHBOARD_HOME_CARD_IDS)).max(DASHBOARD_HOME_CARD_IDS.length),
      hiddenHomeCardIds: z.array(z.enum(DASHBOARD_HOME_CARD_IDS)).max(DASHBOARD_HOME_CARD_IDS.length),
    })).mutation(async ({ ctx, input }) => {
      try {
        return await updateDashboardPreferences({ userId: ctx.user.id, preferences: input });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر حفظ تخصيص لوحة القيادة." });
      }
    }),
  }),

  activityLog: protectedProcedure.input(z.object({ actorUserId: z.number().int().positive().optional(), entityType: z.string().trim().min(1).max(100).optional(), limit: z.number().int().min(1).max(500).optional() }).optional()).query(async ({ ctx, input }) => {
    await requirePlatformView(ctx.user);
    return listActivityLog(input);
  }),

  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const permission = await requirePermission(ctx.user, "view");
    if (await hasLeadershipPlatformScope(ctx.user, permission)) return getDashboardSummary(ctx.user.id, ctx.user.role === "admin");
    const managedUnits = await managedUnitIdsForUser(ctx.user);
    if (managedUnits.length) return getManagedUnitDashboard(managedUnits);
    const { profile } = await requirePersonalWorkspace(ctx.user);
    return getPersonalDashboard(profile.id);
  }),
  leadershipWorkloadObservatory: protectedProcedure.query(async ({ ctx }) => {
    await requireLeadershipWorkloadObservatoryAccess(ctx.user);
    return getLeadershipWorkloadObservatory();
  }),
  sendPerformanceRecommendation: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), unitId: z.number().int().positive(), recommendation: z.string().trim().min(10).max(1000), delivery: z.literal("dashboard_notification") })).mutation(async ({ ctx, input }) => {
    const permission = await requirePermission(ctx.user, "view");
    if (!(await hasLeadershipPlatformScope(ctx.user, permission))) throw new TRPCError({ code: "FORBIDDEN", message: "إرسال التوصيات متاح للقيادة المخولة فقط." });
    return sendPerformanceRecommendation({ actorUserId: ctx.user.id, profileId: input.profileId, unitId: input.unitId, recommendation: input.recommendation });
  }),
  dashboardDepartmentPerformanceDetails: protectedProcedure.input(z.object({ unitId: z.number().int().positive(), period: z.enum(["daily", "weekly", "monthly"]), priority: z.enum(["normal", "high", "critical"]).optional(), jobTitle: z.string().trim().max(180).optional() })).query(async ({ ctx, input }) => {
    const permission = await requirePermission(ctx.user, "view");
    if (!(await hasLeadershipPlatformScope(ctx.user, permission))) throw new TRPCError({ code: "FORBIDDEN", message: "تفاصيل أداء القسم متاحة للقيادة فقط." });
    const now = new Date();
    return getDepartmentPerformanceDetails({ unitId: input.unitId, startAt: reportStart(input.period, now), endAt: now, priority: input.priority, jobTitle: input.jobTitle || undefined });
  }),
  dashboardDepartmentPerformanceComparison: protectedProcedure.input(z.object({ unitIds: z.array(z.number().int().positive()).length(2), period: z.enum(["daily", "weekly", "monthly"]), priority: z.enum(["normal", "high", "critical"]).optional(), jobTitle: z.string().trim().max(180).optional() })).query(async ({ ctx, input }) => {
    const permission = await requirePermission(ctx.user, "view");
    if (!(await hasLeadershipPlatformScope(ctx.user, permission))) throw new TRPCError({ code: "FORBIDDEN", message: "مقارنة الأقسام متاحة للقيادة فقط." });
    const now = new Date();
    const currentStart = reportStart(input.period, now);
    const previous = previousReportRange(input.period, now);
    const [current, previousRows] = await Promise.all([
      Promise.all(input.unitIds.map(unitId => getDepartmentPerformanceDetails({ unitId, startAt: currentStart, endAt: now, priority: input.priority, jobTitle: input.jobTitle || undefined }))),
      Promise.all(input.unitIds.map(unitId => getDepartmentPerformanceDetails({ unitId, startAt: previous.startAt, endAt: previous.endAt, priority: input.priority, jobTitle: input.jobTitle || undefined }))),
    ]);
    return { current, previous: previousRows };
  }),
  dashboardDepartmentPerformance: protectedProcedure.input(z.object({ period: z.enum(["daily", "weekly", "monthly"]), priority: z.enum(["normal", "high", "critical"]).optional(), jobTitle: z.string().trim().max(180).optional() })).query(async ({ ctx, input }) => {
    const permission = await requirePermission(ctx.user, "view");
    if (!(await hasLeadershipPlatformScope(ctx.user, permission))) throw new TRPCError({ code: "FORBIDDEN", message: "هذا التقرير متاح للقيادة فقط." });
    const now = new Date();
    return getDepartmentPerformance({ startAt: reportStart(input.period, now), endAt: now, priority: input.priority, jobTitle: input.jobTitle || undefined });
  }),
  announcements: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      const profile = await getProfileForUser(ctx.user.id);
      return listVisibleAnnouncements({ unitId: profile?.unitId, isLeadership: await hasLeadershipPlatformScope(ctx.user, permission) });
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(3).max(255), body: z.string().trim().min(3).max(10_000), visibility: z.enum(["all", "unit_only"]), unitId: z.number().int().positive().optional(), expiresAt: z.date().optional() }).refine(input => input.visibility !== "unit_only" || Boolean(input.unitId), { message: "يلزم اختيار وحدة للإعلان المقيد بالوحدة." })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      return { id: await createAnnouncement({ ...input, createdByUserId: ctx.user.id }) };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().trim().min(3).max(255).optional(), body: z.string().trim().min(3).max(10_000).optional(), visibility: z.enum(["all", "unit_only"]).optional(), unitId: z.number().int().positive().nullable().optional(), expiresAt: z.date().nullable().optional() })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      return { id: await updateAnnouncement({ ...input, actorUserId: ctx.user.id }) };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      return deleteAnnouncement({ id: input.id, actorUserId: ctx.user.id });
    }),
  }),
  myRoles: protectedProcedure.query(({ ctx }) => rolesForUser(ctx.user)),

  roles: router({
    users: protectedProcedure.query(async ({ ctx }) => {
      await requirePlatformOwner(ctx.user);
      return listPlatformUsersForRoleAssignment();
    }),
    list: protectedProcedure.query(async ({ ctx }) => {
      await requirePlatformOwner(ctx.user);
      return listCourtRoleAssignments();
    }),
    assign: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["court_president", "assistant_president", "court_secretary", "human_resources_manager", "department_manager", "performance_monitor", "trainee_affairs_manager", "technical_support_manager", "technical_support_agent", "administrative_staff", "judicial_trainee", "judge"]), unitId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      if ((input.role === "department_manager" || input.role === "trainee_affairs_manager") && !input.unitId) throw new TRPCError({ code: "BAD_REQUEST", message: "يلزم ربط مدير القسم بوحدة تنظيمية محددة." });
      if (["technical_support_manager", "technical_support_agent"].includes(input.role)) {
        const supportUnit = (await listOrganizationUnits()).find(unit => unit.code === "technical-support");
        if (!supportUnit || input.unitId !== supportUnit.id) throw new TRPCError({ code: "BAD_REQUEST", message: "يجب ربط أدوار الدعم التقني بوحدة الدعم التقني حصراً." });
      }
      return { id: await assignCourtRole({ ...input, delegatedByUserId: ctx.user.id }) };
    }),
    revoke: protectedProcedure.input(z.object({ assignmentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      await revokeCourtRole(input.assignmentId, ctx.user.id);
      return { success: true };
    }),
  }),

  management: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireManagerDelegationAuthority(ctx.user);
      return listDepartmentManagerAssignments();
    }),
    assign: protectedProcedure.input(z.object({ userId: z.number().int().positive(), unitId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireManagerDelegationAuthority(ctx.user);
      return assignDepartmentManager({ userId: input.userId, unitId: input.unitId, delegatedByUserId: ctx.user.id });
    }),
    end: protectedProcedure.input(z.object({ assignmentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireManagerDelegationAuthority(ctx.user);
      return endDepartmentManagerAssignment({ assignmentId: input.assignmentId, actorUserId: ctx.user.id });
    }),
    templates: protectedProcedure.query(async ({ ctx }) => {
      const unitIds = await manageableTemplateUnitIds(ctx.user);
      return listDepartmentTaskTemplates(unitIds);
    }),
    setTemplateActive: protectedProcedure.input(z.object({ templateId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      const unitIds = await manageableTemplateUnitIds(ctx.user);
      const unitId = await getTaskTemplateUnitId(input.templateId);
      if (unitId === null) throw new TRPCError({ code: "NOT_FOUND", message: "قالب المهمة غير موجود." });
      if (unitId !== null && !unitIds.includes(unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تفعيل قالب مهمة خارج نطاق قسمك." });
      return setDepartmentTaskTemplateActive({ templateId: input.templateId, isActive: input.isActive, actorUserId: ctx.user.id });
    }),
  }),

  departmentDocs: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const unitIds = await manageableTemplateUnitIds(ctx.user);
      const [templates, tasks, documents, units, people] = await Promise.all([
        listDepartmentTaskTemplates(unitIds),
        listTasksForUnits(unitIds),
        listDepartmentDocuments(unitIds),
        listOrganizationUnits().then(all => all.filter(unit => unitIds.includes(unit.id))),
        listProfiles().then(all => all.filter(profile => profile.unitId && unitIds.includes(profile.unitId))),
      ]);
      return { unitIds, units, templates, tasks, documents, people };
    }),
    createTask: protectedProcedure.input(z.object({ unitId: z.number().int().positive(), title: z.string().trim().min(3).max(500), assigneeProfileId: z.number().int().positive().optional(), dueAt: z.date().optional() })).mutation(async ({ ctx, input }) => {
      const unitIds = await manageableTemplateUnitIds(ctx.user);
      if (!unitIds.includes(input.unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك إنشاء مهمة خارج نطاق قسمك." });
      const scheduledFor = new Date();
      const dueAt = input.dueAt ?? new Date(Date.now() + 6 * 60 * 60 * 1000);
      return { id: await createTask({ title: input.title, unitId: input.unitId, assigneeProfileId: input.assigneeProfileId, priority: "normal", scheduledFor, dueAt, assignedByUserId: ctx.user.id }) };
    }),
    uploadDocument: protectedProcedure.input(z.object({ unitId: z.number().int().positive(), title: z.string().trim().min(2).max(240), originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(120), contentBase64: z.string().min(1).max(12_000_000) })).mutation(async ({ ctx, input }) => {
      const unitIds = await manageableTemplateUnitIds(ctx.user);
      if (!unitIds.includes(input.unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك رفع مستند خارج نطاق قسمك." });
      const profile = await getProfileForUser(ctx.user.id);
      return createDepartmentDocument({ ...input, actorUserId: ctx.user.id, profileId: profile?.id });
    }),
  }),

  workflowMap: router({
    /** تحليل مستند الإجراءات (Word/Excel/PDF/صورة) وإرجاع خطوات المخطط ومخططه المرئي. */
    analyze: protectedProcedure
      .input(z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(160).optional(), contentBase64: z.string().min(4).max(14_000_000) }))
      .mutation(async ({ ctx, input }) => {
        await requireOperationsManager(ctx.user);
        return analyzeWorkflowDocument({ userId: ctx.user.id, originalName: input.originalName, mimeType: input.mimeType ?? "", contentBase64: input.contentBase64 });
      }),
    /** الموظفون المتاحون للإسناد في نطاق المستخدم مع حملهم الحالي. */
    staff: protectedProcedure.query(async ({ ctx }) => {
      const unitIds = await workflowMapUnitIds(ctx.user);
      return listWorkflowStaff({ unitIds });
    }),
    /** توزيع خطوات المخطط آلياً أو يدوياً وإنشاء مهام فعلية بإشعارات. */
    distribute: protectedProcedure
      .input(z.object({
        sourceName: z.string().trim().min(1).max(255),
        title: z.string().trim().min(2).max(200),
        mode: z.enum(["auto", "manual"]),
        unitId: z.number().int().positive().nullable().optional(),
        steps: z.array(z.object({
          order: z.number().int().positive().max(200),
          title: z.string().trim().min(3).max(220),
          description: z.string().trim().max(600).optional(),
          assigneeProfileId: z.number().int().positive().nullable().optional(),
          priority: z.enum(["normal", "high", "critical"]).optional(),
          slaDays: z.number().int().min(1).max(120).optional(),
          dueAt: z.date().optional(),
        })).min(1).max(40),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOperationsManager(ctx.user);
        const unitIds = await workflowMapUnitIds(ctx.user);
        const unitId = input.unitId ?? null;
        if (unitId !== null && !unitIds.includes(unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك توزيع مخطط خارج نطاق وحداتك." });
        return distributeWorkflowSteps({ actorUserId: ctx.user.id, unitIds, unitId, sourceName: input.sourceName, title: input.title, mode: input.mode, steps: input.steps.map(step => ({ ...step, dueAt: step.dueAt ?? null })) });
      }),
  }),

  modules: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requirePlatformOwner(ctx.user);
      return listPlatformModules();
    }),
    create: protectedProcedure.input(z.object({ moduleKey: z.string().trim().regex(/^[a-z0-9_-]+$/).max(80), label: z.string().trim().min(2).max(160), path: z.string().trim().min(1).max(240), iconKey: z.string().trim().min(2).max(80), moduleType: z.enum(["navigation", "software"]), audience: z.array(z.enum(["full_control", "court_president", "assistant_president", "court_secretary", "department_manager", "judge", "employee", "trainee"])).min(1), sortOrder: z.number().int().min(0).max(10000).default(0) })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      return { id: await createPlatformModule({ ...input, createdByUserId: ctx.user.id }) };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), label: z.string().trim().min(2).max(160).optional(), path: z.string().trim().min(1).max(240).optional(), iconKey: z.string().trim().min(2).max(80).optional(), audience: z.array(z.enum(["full_control", "court_president", "assistant_president", "court_secretary", "department_manager", "judge", "employee", "trainee"])).min(1).optional(), sortOrder: z.number().int().min(0).max(10000).optional(), isEnabled: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      await updatePlatformModule({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
  }),

  meetings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listMeetings();
      const profile = await getProfileForUser(ctx.user.id);
      return listMeetings(profile?.unitId);
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(3).max(255), agenda: z.string().trim().max(20000).optional(), scheduledAt: z.date(), location: z.string().trim().max(255).optional(), unitId: z.number().int().positive().nullable().optional() })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "manage_access");
      return { id: await createMeeting({ ...input, createdByUserId: ctx.user.id }) };
    }),
    attendees: protectedProcedure.input(z.object({ meetingId: z.number().int().positive() })).query(async ({ ctx, input }) => { await requirePermission(ctx.user, "view"); return listMeetingAttendees(input.meetingId); }),
    invite: protectedProcedure.input(z.object({ meetingId: z.number().int().positive(), profileIds: z.array(z.number().int().positive()).min(1).max(100) })).mutation(async ({ ctx, input }) => { await requirePermission(ctx.user, "manage_access"); await addMeetingAttendees({ ...input, actorUserId: ctx.user.id }); return { success: true }; }),
    updateAttendance: protectedProcedure.input(z.object({ attendeeId: z.number().int().positive(), attendanceStatus: z.enum(["invited", "attended", "absent", "excused"]) })).mutation(async ({ ctx, input }) => { await requirePermission(ctx.user, "manage_access"); await updateMeetingAttendee({ id: input.attendeeId, attendanceStatus: input.attendanceStatus, actorUserId: ctx.user.id }); return { success: true }; }),
    recommendationsToTasks: protectedProcedure.input(z.object({ meetingId: z.number().int().positive(), unitId: z.number().int().positive().nullable().optional(), recommendations: z.string().trim().min(3).max(20000), scheduledFor: z.date(), dueAt: z.date() })).mutation(async ({ ctx, input }) => { await requirePermission(ctx.user, "manage_access"); return { taskIds: await createTasksFromMeetingRecommendations({ ...input, actorUserId: ctx.user.id }) }; }),
    minutes: protectedProcedure.input(z.object({ meetingId: z.number().int().positive(), minutes: z.string().trim().min(3).max(30000), recommendations: z.string().trim().max(20000).optional() })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "manage_access");
      await saveMeetingMinutes({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
  }),

  decisions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listPublishedDecisionsCirculars();
      const profile = await getProfileForUser(ctx.user.id);
      return listPublishedDecisionsCirculars(profile?.unitId);
    }),
    create: protectedProcedure.input(z.object({ kind: z.enum(["decision", "circular"]), title: z.string().trim().min(3).max(255), body: z.string().trim().min(3).max(20000), unitId: z.number().int().positive().nullable().optional() })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      return { id: await createDecisionCircular({ ...input, actorUserId: ctx.user.id }) };
    }),
    publish: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      await publishDecisionCircular({ id: input.id, actorUserId: ctx.user.id });
      return { success: true };
    }),
    markRead: protectedProcedure.input(z.object({ decisionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await markDecisionCircularRead({ decisionId: input.decisionId, userId: ctx.user.id });
      return { success: true };
    }),
  }),

  support: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requirePermission(ctx.user, "view");
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف شخصي لاستخدام الدعم التقني." });
      return listSupportTickets({ profileId: profile.id, roles: await rolesForUser(ctx.user) });
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(5).max(255), description: z.string().trim().min(10).max(8000), priority: z.enum(["normal", "high", "critical"]).default("normal"), attachments: z.array(z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), contentBase64: z.string().min(20).max(2_800_000) })).max(3).optional() })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "view");
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف شخصي لتسجيل تذكرة الدعم." });
      try {
        validateSupportAttachments(input.attachments);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر التحقق من المرفق." });
      }
      return createSupportTicket({ ...input, requesterProfileId: profile.id, requesterUnitId: profile.unitId, requesterUserId: ctx.user.id });
    }),
    detail: protectedProcedure.input(z.object({ ticketId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const access = await requireSupportTicketAccess(ctx.user, input.ticketId);
      const canViewInternalComments = access.isLeadership || access.isAssignedAgent;
      return { ...access.detail, comments: canViewInternalComments ? access.detail.comments : access.detail.comments.filter(item => !item.comment.isInternal) };
    }),
    comment: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), body: z.string().trim().min(2).max(5000), isInternal: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const access = await requireSupportTicketAccess(ctx.user, input.ticketId);
      const canWriteInternal = access.isLeadership || access.isAssignedAgent;
      if (input.isInternal && !canWriteInternal) throw new TRPCError({ code: "FORBIDDEN", message: "الملاحظات الداخلية متاحة لموظف الدعم المختص أو القيادة فقط." });
      await addSupportTicketComment({ ticketId: input.ticketId, authorProfileId: access.profile.id, authorUserId: ctx.user.id, body: input.body, isInternal: input.isInternal && canWriteInternal });
      return { success: true };
    }),
    resolve: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), resolutionNote: z.string().trim().min(3).max(5000) })).mutation(async ({ ctx, input }) => {
      const access = await requireSupportTicketAccess(ctx.user, input.ticketId);
      if (!access.isLeadership && !access.isAssignedAgent) throw new TRPCError({ code: "FORBIDDEN", message: "إغلاق التذكرة متاح لموظف الدعم المكلف أو مدير الدعم أو القيادة فقط." });
      await resolveSupportTicket({ ticketId: input.ticketId, actorProfileId: access.profile.id, actorUserId: ctx.user.id, resolutionNote: input.resolutionNote });
      return { success: true };
    }),
  }),

      people: router({
    self: protectedProcedure.query(async ({ ctx }) => {
      await requirePermission(ctx.user, "view");
      const profile = await getProfileForUser(ctx.user.id);
      const units = await listOrganizationUnits();
      if (profile) {
        const unit = profile.unitId ? units.find(item => item.id === profile.unitId) : null;
        return { ...profile, unitName: unit?.name ?? null, unitCode: unit?.code ?? null };
      }
      const db = await getDb();
      const department = db ? (await db.select({ displayName: departmentAccounts.displayName, unitId: departmentAccounts.unitId, loginEmail: departmentAccounts.loginEmail }).from(departmentAccounts).where(and(eq(departmentAccounts.userId, ctx.user.id), eq(departmentAccounts.isActive, true))).limit(1))[0] : undefined;
      if (!department) throw new TRPCError({ code: "FORBIDDEN", message: "لا يوجد ملف موظف أو حساب قسم مرتبط بهذا الحساب." });
      const unit = units.find(item => item.id === department.unitId);
      return { id: 0, unitId: department.unitId, unitName: unit?.name ?? department.displayName, unitCode: unit?.code ?? null, fullName: department.displayName, email: department.loginEmail, employeeNumber: null, personType: "administrative" as const, jobTitle: "حساب قسم", judicialFormation: null, attendanceMode: null, activityState: "inactive" as const, lastActiveAt: null, status: "active" as const, directManagerProfileId: null };
    }),
    list: protectedProcedure.input(z.object({ personType: z.enum(["administrative", "trainee", "judge"]).optional() }).optional()).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      const roles = await rolesForUser(ctx.user);
      if (roles.includes("human_resources_manager")) {
        if (input?.personType && input.personType !== "administrative") return [];
        return listProfiles("administrative");
      }
      if (canViewWholePlatform(permission) || roles.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary")) return listProfiles(input?.personType);

      if (roles.includes("performance_monitor")) return listProfiles(input?.personType);
      if (roles.includes("judge")) {
        const judgeProfile = await getProfileForUser(ctx.user.id);
        if (!judgeProfile || judgeProfile.personType !== "judge") throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط حساب القاضي بملف قاضٍ فعال." });
        if (input?.personType && input.personType !== "trainee") return [];
        return listTraineesForJudge(judgeProfile.id);
      }
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (managedUnitIds.length) {
        if (input?.personType === "judge") return listProfiles("judge");
        if (input?.personType && input.personType !== "administrative") return [];
        return listProfilesForUnits(managedUnitIds, "administrative");
      }
      const { profile } = await requirePersonalWorkspace(ctx.user);
      // الموظف الإداري يرى ملفه فقط؛ عرض ملفات الوحدة مخصص للمديرين أو الصلاحيات القيادية.
      return [profile];
    }),
    create: protectedProcedure.input(z.object({
      unitId: z.number().int().positive().optional(), personType: z.enum(["administrative", "trainee", "judge"]), fullName: z.string().trim().min(3).max(240), email: z.string().trim().email().max(320).refine(value => isOfficialMojEmail(value), "يجب أن يكون بريد الملف الرسمي من نطاق moj.gov.sa.").optional(), employeeNumber: z.string().trim().max(80).optional(), jobTitle: z.string().trim().max(180).optional(), judicialFormation: z.string().trim().max(180).optional(), attendanceMode: z.enum(["in_person", "remote", "mixed"]).optional(), status: z.enum(["active", "on_leave", "inactive", "pending_review"]), reason: z.string().trim().min(5).max(1000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { roles } = await requireHumanResourcesOrLeadership(ctx.user);
      if (roles.includes("human_resources_manager") && input.personType !== "administrative") throw new TRPCError({ code: "FORBIDDEN", message: "صلاحية الموارد البشرية مخصصة لملفات الموظفين الإداريين فقط." });
      if (roles.includes("human_resources_manager") && !input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "يلزم بيان سبب إضافة الموظف أو تعديل بيانات دخوله." });
      return { id: await createProfile({ ...input, actorUserId: ctx.user.id }) };
    }),
    deactivate: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), reason: z.string().trim().min(5).max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const { roles } = await requireHumanResourcesOrLeadership(ctx.user);
      if (roles.includes("human_resources_manager") && !input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "يلزم بيان سبب إيقاف دخول الموظف." });
      await requireAssetClearance(input.profileId);
      await deactivateProfile(input.profileId, ctx.user.id, input.reason);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), unitId: z.number().int().positive().nullable().optional(), directManagerProfileId: z.number().int().positive().nullable().optional(), fullName: z.string().trim().min(3).max(240), email: z.string().trim().email().max(320).refine(value => isOfficialMojEmail(value), "يجب أن يكون بريد الملف الرسمي من نطاق moj.gov.sa.").optional(), employeeNumber: z.string().trim().max(80).optional(), jobTitle: z.string().trim().max(180).optional(), judicialFormation: z.string().trim().max(180).optional(), attendanceMode: z.enum(["in_person", "remote", "mixed"]).optional(), status: z.enum(["active", "on_leave", "inactive", "pending_review"]), reason: z.string().trim().min(5).max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const { roles } = await requireHumanResourcesOrLeadership(ctx.user);
      if (roles.includes("human_resources_manager") && !input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "يلزم بيان سبب تعديل بيانات الموظف أو دخوله." });
      if (input.status === "inactive" || input.unitId !== undefined) await requireAssetClearance(input.profileId);
      await updateOperationalProfile({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
    delegations: protectedProcedure.input(z.object({ profileId: z.number().int().positive().optional(), unitId: z.number().int().positive().optional(), status: z.enum(["planned", "active", "ended", "cancelled"]).optional() }).optional()).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "manage_access");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listProfileDelegations(input);
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (!managedUnitIds.length) throw new TRPCError({ code: "FORBIDDEN", message: "إدارة سجلات التكليف محصورة بالقيادة أو مدير الوحدة المخولة." });
      if (input?.unitId && !managedUnitIds.includes(input.unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض تكليفات وحدة خارج نطاقك." });
      return listProfileDelegations({ ...input, unitId: input?.unitId ?? managedUnitIds[0] });
    }),
    createDelegation: protectedProcedure.input(z.object({ delegateProfileId: z.number().int().positive(), coveredProfileId: z.number().int().positive().optional(), unitId: z.number().int().positive().optional(), assignmentType: z.enum(["acting", "temporary_duty", "formation_assignment"]).default("acting"), target: z.enum(["court_presidency", "unit"]).default("unit"), title: z.string().trim().min(3).max(240), sourceReference: z.string().trim().max(240).optional(), startsAt: z.date(), endsAt: z.date().optional(), status: z.enum(["planned", "active", "ended", "cancelled"]).default("active"), notes: z.string().trim().max(4000).optional() }).refine(input => !input.endsAt || input.endsAt >= input.startsAt, { message: "تاريخ نهاية التكليف يجب أن يأتي بعد البداية." })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "manage_access");
      const wholePlatform = await hasLeadershipPlatformScope(ctx.user, permission);
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (!wholePlatform && (!input.unitId || !managedUnitIds.includes(input.unitId))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك إنشاء تكليف خارج وحدة مخولة لك." });
      if (input.target === "court_presidency") {
        const candidate = await getProfileById(input.delegateProfileId);
        if (!candidate || candidate.personType !== "judge") throw new TRPCError({ code: "BAD_REQUEST", message: "تكليف رئاسة المحكمة متاح للقضاة فقط." });
      }
      return { id: await createProfileDelegation({ ...input, createdByUserId: ctx.user.id }) };
    }),
    updateDelegationStatus: protectedProcedure.input(z.object({ delegationId: z.number().int().positive(), status: z.enum(["planned", "active", "ended", "cancelled"]) })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "manage_access");
      return updateProfileDelegationStatus({ ...input, actorUserId: ctx.user.id });
    }),
  }),

  judges: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requirePlatformView(ctx.user);
      return listProfiles("judge");
    }),
    create: protectedProcedure.input(z.object({ fullName: z.string().trim().min(3).max(240), email: z.string().trim().email().max(320).refine(value => isOfficialMojEmail(value), "يجب أن يكون بريد الملف الرسمي من نطاق moj.gov.sa.").optional(), employeeNumber: z.string().trim().max(80).optional(), jobTitle: z.string().trim().max(180).optional(), judicialFormation: z.string().trim().max(180).optional(), attendanceMode: z.enum(["in_person", "remote", "mixed"]).optional(), status: z.enum(["active", "on_leave", "inactive", "pending_review"]).default("active") })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      return { id: await createProfile({ ...input, personType: "judge", actorUserId: ctx.user.id }) };
    }),
    update: protectedProcedure.input(z.object({ judgeId: z.number().int().positive(), fullName: z.string().trim().min(3).max(240), email: z.string().trim().email().max(320).refine(value => isOfficialMojEmail(value), "يجب أن يكون بريد الملف الرسمي من نطاق moj.gov.sa.").optional(), employeeNumber: z.string().trim().max(80).optional(), jobTitle: z.string().trim().max(180).optional(), judicialFormation: z.string().trim().max(180).optional(), attendanceMode: z.enum(["in_person", "remote", "mixed"]).optional(), status: z.enum(["active", "on_leave", "inactive", "pending_review"]) })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      if (input.status === "inactive") await requireAssetClearance(input.judgeId);
      await updateJudgeProfile({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
  }),

  tasks: router({
    archiveOperational: protectedProcedure.mutation(async ({ ctx }) => {
      await requireOperationsManager(ctx.user);
      return archiveOperationalWork({ actorUserId: ctx.user.id });
    }),
    archived: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(300).optional() }).optional()).query(async ({ ctx, input }) => {
      await requirePlatformView(ctx.user);
      return listArchivedOperationalWork(input?.limit);
    }),
    restoreArchived: protectedProcedure.input(z.object({ entityType: z.enum(["task", "delay"]), entityId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      return restoreArchivedOperationalWork({ ...input, actorUserId: ctx.user.id });
    }),
    list: protectedProcedure.input(z.object({ status: z.enum(["new", "in_progress", "under_review", "completed", "overdue", "cancelled"]).optional(), assigneeProfileId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) { const viewerProfile = await getProfileForUser(ctx.user.id); return listTasks({ ...input, visibleProfileId: viewerProfile?.id }); }
      const roles = await rolesForUser(ctx.user);
      if (roles.includes("judge")) {
        const judgeProfile = await getProfileForUser(ctx.user.id);
        if (!judgeProfile || judgeProfile.personType !== "judge") throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط حساب القاضي بملف قاضٍ فعال." });
        const assignedTrainees = await listTraineesForJudge(judgeProfile.id);
        const taskGroups = await Promise.all(assignedTrainees.map(profile => listTasks({ assigneeProfileId: profile.id, status: input?.status, visibleProfileId: judgeProfile.id })));
        return taskGroups.flat();
      }
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (managedUnitIds.length) { const viewerProfile = await getProfileForUser(ctx.user.id); return listTasksForUnits(managedUnitIds, input?.status, viewerProfile?.id); }
      const { profile } = await requirePersonalWorkspace(ctx.user);
      return listTasksForProfile(profile.id, input?.status);
    }),
    routeTargets: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      const roles = await rolesForUser(ctx.user);
      if (!(await hasLeadershipPlatformScope(ctx.user, permission)) && !roles.includes("department_manager")) throw new TRPCError({ code: "FORBIDDEN", message: "خيارات إحالة المهام متاحة للمدير المباشر والقيادة فقط." });
      const targets = await listTaskRouteTargets();
      const managedUnits = await managedUnitIdsForUser(ctx.user);
      const leadership = await hasLeadershipPlatformScope(ctx.user, permission);
      return leadership ? targets : targets.filter(target => target.role !== "department_manager" || (target.unitId !== null && managedUnits.includes(target.unitId)));
    }),
    route: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), targetProfileId: z.number().int().positive(), note: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const roles = await rolesForUser(ctx.user);
      const leadership = await hasLeadershipPlatformScope(ctx.user, permission);
      const managedUnits = await managedUnitIdsForUser(ctx.user);
      if (!leadership && (!roles.includes("department_manager") || !task.unitId || !managedUnits.includes(task.unitId))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك إحالة مهمة خارج نطاق قسمك." });
      const allowedTargets = await listTaskRouteTargets();
      const allowed = leadership ? allowedTargets : allowedTargets.filter(target => target.role !== "department_manager" || (target.unitId !== null && managedUnits.includes(target.unitId)));
      if (!allowed.some(target => target.profileId === input.targetProfileId)) throw new TRPCError({ code: "FORBIDDEN", message: "المستلم المحدد ليس ضمن تسلسل الإحالة المصرح." });
      return routeTaskToProfile({ ...input, actorUserId: ctx.user.id });
    }),
    createSelf: protectedProcedure.input(z.object({ title: z.string().trim().min(3).max(2000), priority: z.enum(["normal", "high", "critical"]), taskType: z.enum(["permanent", "urgent"]).default("permanent"), taskNotes: z.string().trim().max(4000).optional(), scheduledFor: z.date(), dueAt: z.date() }).refine(input => input.dueAt >= input.scheduledFor, { message: "موعد الاستحقاق يجب أن يأتي بعد موعد الجدولة." })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "edit");
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف موظف لإنشاء مهمة ذاتية." });
      return createSelfTask({ ...input, profileId: profile.id, actorUserId: ctx.user.id });
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(3).max(2000), unitId: z.number().int().positive().optional(), assigneeProfileId: z.number().int().positive().optional(), traineeCopyProfileId: z.number().int().positive().optional(), watcherProfileId: z.number().int().positive().optional(), priority: z.enum(["normal", "high", "critical"]), taskType: z.enum(["permanent", "urgent"]).default("permanent"), scheduledFor: z.date(), dueAt: z.date(), recurrence: z.enum(["none", "daily", "weekly", "monthly", "custom"]).default("none"), recurrenceEndAt: z.date().optional(), isConfidential: z.boolean().default(false), confidentialityExpiresAt: z.date().optional(), taskNotes: z.string().trim().max(4000).optional(), attachments: z.array(z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(120), contentBase64: z.string().min(4).max(12_000_000) })).max(5).optional() }).refine(input => input.dueAt >= input.scheduledFor, { message: "موعد الاستحقاق يجب أن يأتي بعد موعد الجدولة." })).mutation(async ({ ctx, input }) => {
      const roles = await requireOperationsManager(ctx.user);
      const isLeadership = roles.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary");
      let taskId: number;
      if (!isLeadership && roles.includes("trainee_affairs_manager")) {
        if (!input.assigneeProfileId) throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار المكلف عند إسناد مهمة من مستوى القسم." });
        const assignee = await getProfileById(input.assigneeProfileId);
        const managedUnitIds = await managedUnitIdsForUser(ctx.user);
        if (!assignee?.unitId || !managedUnitIds.includes(assignee.unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن إسناد مهمة خارج نطاق القسم المفوض لك." });
        taskId = await createTask({ ...input, unitId: assignee.unitId, assignedByUserId: ctx.user.id });
      } else {
        taskId = await createTask({ ...input, assignedByUserId: ctx.user.id });
      }
      if (input.attachments?.length) {
        const uploaderProfile = await getProfileForUser(ctx.user.id);
        for (const attachment of input.attachments) {
          if (uploaderProfile) await addTaskAttachment({ taskId, actorUserId: ctx.user.id, uploaderProfileId: uploaderProfile.id, attachment });
        }
      }
      return { id: taskId };
    }),
    submitForReview: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), note: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة المطلوبة غير موجودة." });
      const roles = await rolesForUser(ctx.user);
      const profile = await getProfileForUser(ctx.user.id);
      const ownsTask = Boolean(profile && task.assigneeProfileId === profile.id);
      if (!ownsTask && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك رفع مهمة ليست مسندة إليك." });
      return submitTaskForReview(input.taskId, ctx.user.id, input.note);
    }),
    updateStatus: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), status: z.enum(["new", "in_progress", "under_review", "completed", "overdue", "cancelled"]), note: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const leadership = await hasLeadershipPlatformScope(ctx.user, permission);
      const managedUnits = await managedUnitIdsForUser(ctx.user);
      if (!leadership && (!task.unitId || !managedUnits.includes(task.unitId))) throw new TRPCError({ code: "FORBIDDEN", message: "تعديل حالة المهمة محصور بالقيادة أو مدير القسم المسؤول." });
      return updateTaskStatus({ ...input, actorUserId: ctx.user.id });
    }),
    acknowledge: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      if (task.assigneeProfileId !== profile?.id && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تأكيد مهمة غير مسندة إليك." });
      return acknowledgeTask({ taskId: input.taskId, actorUserId: ctx.user.id, profileId: profile?.id, scheduledFor: task.scheduledFor });
    }),
    markAsProcessed: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), note: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      if (task.assigneeProfileId !== profile?.id && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك إتمام مهمة غير مسندة إليك." });
      return markTaskAsProcessed({ taskId: input.taskId, actorUserId: ctx.user.id, note: input.note });
    }),
    addComment: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), comment: z.string().trim().min(2).max(4000) })).mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
      if (!profile || (!participates && !canManageOperations(roles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك التعليق على هذه المهمة." });
      return { id: await addTaskComment({ taskId: input.taskId, profileId: profile.id, authorUserId: ctx.user.id, comment: input.comment }) };
    }),
    reportObstacle: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), detail: z.string().trim().min(3).max(4000) })).mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
      if (!profile || (!participates && !canManageOperations(roles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تسجيل عائق على هذه المهمة." });
      return reportTaskObstacle({ taskId: input.taskId, actorUserId: ctx.user.id, detail: input.detail });
    }),
    requestReassignment: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), reason: z.string().trim().min(3).max(4000) })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "edit");
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف موظف لتقديم طلب إعادة الإسناد." });
      return createTaskExceptionRequest({ taskId: input.taskId, kind: "reassignment", requesterProfileId: profile.id, actorUserId: ctx.user.id, reason: input.reason });
    }),
    details: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "view");
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
      if (!profile || (!participates && !canManageOperations(roles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض تفاصيل هذه المهمة." });
      return getTaskDetails(input.taskId);
    }),
    setPinned: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), isPinned: z.boolean() })).mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      const isAssignee = profile && task.assigneeProfileId === profile.id;
      if (!isAssignee && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تثبيت مهمة غير مسندة إليك." });
      return setTaskPinned({ taskId: input.taskId, actorUserId: ctx.user.id, isPinned: input.isPinned });
    }),
    setNotes: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), notes: z.string().trim().max(4000) })).mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      const isAssignee = profile && task.assigneeProfileId === profile.id;
      if (!isAssignee && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تعديل مفكرة مهمة غير مسندة إليك." });
      return setTaskNotes({ taskId: input.taskId, actorUserId: ctx.user.id, notes: input.notes });
    }),
    createDepartment: protectedProcedure.input(z.object({ title: z.string().trim().min(3).max(2000), unitId: z.number().int().positive(), assigneeProfileIds: z.array(z.number().int().positive()).min(1).max(50), taskType: z.enum(["permanent", "urgent"]), priority: z.enum(["normal", "high", "critical"]), scheduledFor: z.date(), dueAt: z.date() }).refine(input => input.dueAt >= input.scheduledFor, { message: "موعد الاستحقاق يجب أن يأتي بعد موعد البدء." })).mutation(async ({ ctx, input }) => {
      const roles = await requireOperationsManager(ctx.user);
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      const isLeadership = roles.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary");
      if (!isLeadership && !managedUnitIds.includes(input.unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك إنشاء مهام خارج نطاق قسمك المفوض." });
      return createDepartmentTasks({ ...input, assignedByUserId: ctx.user.id });
    }),
    exceptions: router({
      request: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), kind: z.enum(["reassignment", "obstacle"]), reason: z.string().trim().min(3).max(4000) })).mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.user, "edit");
        const profile = await getProfileForUser(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف موظف لتقديم طلب المهمة." });
        return createTaskExceptionRequest({ ...input, requesterProfileId: profile.id, actorUserId: ctx.user.id });
      }),
      pendingForManager: protectedProcedure.query(async ({ ctx }) => {
        await requirePermission(ctx.user, "view");
        const profile = await getProfileForUser(ctx.user.id);
        if (!profile) return [];
        return listTaskExceptionRequestsForManager(profile.id, "pending");
      }),
      decide: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), managerNote: z.string().trim().min(3).max(4000), reassigneeProfileId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.user, "edit");
        const profile = await getProfileForUser(ctx.user.id);
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف مدير لاتخاذ القرار." });
        return decideTaskExceptionRequest({ ...input, managerProfileId: profile.id, actorUserId: ctx.user.id });
      }),
    }),
    comment: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), comment: z.string().trim().min(2).max(4000) })).mutation(async ({ ctx, input }) => {
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      if (task.assigneeProfileId !== profile?.id && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك التعليق على مهمة غير مسندة إليك." });
      return { id: await addTaskCommentAndEscalate({ taskId: input.taskId, profileId: profile?.id, authorUserId: ctx.user.id, comment: input.comment }) };
    }),
    addProgressNote: protectedProcedure.input(z.object({
      taskId: z.number().int().positive(),
      note: z.string().trim().min(2).max(4000),
      attachment: z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(120), contentBase64: z.string().min(4).max(12_000_000) }).optional(),
      mentionedProfileIds: z.array(z.number().int().positive()).max(10).optional(),
    })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "edit");
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
      if (!profile || (!participates && !canManageOperations(roles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تسجيل تحديث في هذه المهمة." });
      return addTaskProgressNote({ ...input, profileId: profile.id, actorUserId: ctx.user.id });
    }),
    timeline: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "view");
      const task = await getTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
      const profile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
      if (!profile || (!participates && !canManageOperations(roles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض سجل هذه المهمة." });
      return listTaskTimeline(input.taskId);
    }),
    attachments: router({
      list: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        const task = await getTaskById(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
        const profile = await getProfileForUser(ctx.user.id);
        const roles = await rolesForUser(ctx.user);
        const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
        if (!participates && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض مرفقات هذه المهمة." });
        return listTaskAttachments(input.taskId);
      }),
      upload: protectedProcedure.input(z.object({
        taskId: z.number().int().positive(),
        attachment: z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(120), contentBase64: z.string().min(4).max(12_000_000) }),
      })).mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.user, "edit");
        const task = await getTaskById(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
        const profile = await getProfileForUser(ctx.user.id);
        const roles = await rolesForUser(ctx.user);
        const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
        if (!profile || (!participates && !canManageOperations(roles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك إرفاق ملف بهذه المهمة." });
        return addTaskAttachment({ taskId: input.taskId, actorUserId: ctx.user.id, uploaderProfileId: profile.id, attachment: input.attachment });
      }),
      extractText: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), attachmentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.user, "view");
        const task = await getTaskById(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
        const profile = await getProfileForUser(ctx.user.id);
        const roles = await rolesForUser(ctx.user);
        const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
        if (!profile || (!participates && !canManageOperations(roles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك استخراج نص من مرفق هذه المهمة." });
        return extractTaskAttachmentText({ ...input, actorUserId: ctx.user.id });
      }),
      translateText: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), attachmentId: z.number().int().positive(), text: z.string().trim().min(1).max(60_000), targetLanguage: z.enum(["en", "fr", "ur", "tr", "hi", "bn"]) })).mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.user, "view");
        const task = await getTaskById(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
        const profile = await getProfileForUser(ctx.user.id);
        const roles = await rolesForUser(ctx.user);
        const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
        if (!profile || (!participates && !canManageOperations(roles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك ترجمة نص مرفق هذه المهمة." });
        return translateTaskAttachmentText({ ...input, actorUserId: ctx.user.id });
      }),
      summarizeText: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), attachmentId: z.number().int().positive(), text: z.string().trim().min(1).max(60_000), sourceKind: z.enum(["extracted", "translated"]) })).mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.user, "view");
        const task = await getTaskById(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
        const profile = await getProfileForUser(ctx.user.id);
        const roles = await rolesForUser(ctx.user);
        const participates = profile && (task.assigneeProfileId === profile.id || task.watcherProfileId === profile.id);
        if (!profile || (!participates && !canManageOperations(roles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تلخيص نص مرفق هذه المهمة." });
        return summarizeTaskAttachmentText({ ...input, actorUserId: ctx.user.id });
      }),
    }),
  }),

  delays: router({
    list: protectedProcedure.input(z.object({ status: z.enum(["under_follow_up", "overdue", "resolved", "archived"]).optional() }).optional()).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listDelays(input?.status);
      const roles = await rolesForUser(ctx.user);
      if (roles.includes("judge")) {
        const judgeProfile = await getProfileForUser(ctx.user.id);
        if (!judgeProfile || judgeProfile.personType !== "judge") throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط حساب القاضي بملف قاضٍ فعال." });
        const assignedTrainees = await listTraineesForJudge(judgeProfile.id);
        const delayGroups = await Promise.all(assignedTrainees.map(profile => listDelaysForProfile(profile.id)));
        return delayGroups.flat().filter(delay => !input?.status || delay.status === input.status);
      }
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (managedUnitIds.length) return listDelaysForUnits(managedUnitIds, input?.status);
      const { profile } = await requirePersonalWorkspace(ctx.user);
      return listDelaysForProfile(profile.id);
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(3).max(2000), category: z.string().trim().min(2).max(160), unitId: z.number().int().positive().optional(), relatedProfileId: z.number().int().positive().optional(), ownerProfileId: z.number().int().positive().optional(), referenceNumber: z.string().trim().max(120).optional(), actionTaken: z.string().trim().max(5000).optional(), nextFollowUpAt: z.date().optional() })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      return { id: await createDelay({ ...input, createdByUserId: ctx.user.id }) };
    }),
  }),

  approvals: router({
    createManagerAssignment: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), unitId: z.number().int().positive(), reason: z.string().trim().min(5).max(2000) })).mutation(async ({ ctx, input }) => {
      try {
        const roles = await rolesForUser(ctx.user);
        const firstRole: ManagerAssignmentApprovalRole = roles.includes("court_president") ? "court_president" : roles.includes("court_secretary") ? "court_secretary" : roles.includes("human_resources_manager") ? "human_resources_manager" : (() => { throw new TRPCError({ code: "FORBIDDEN", message: "إنشاء طلبات تسكين مديري الأقسام متاح للأمين والرئيس والموارد البشرية فقط." }); })();
        return { approvalId: await createManagerAssignmentApproval({ ...input, requestedByUserId: ctx.user.id, firstRole }) };
      } catch (error) {
        await notifyPlatformOwnerSecurityAlert({ actorUserId: ctx.user.id, action: "department_manager_assignment.request_attempt_failed", entityType: "approval", details: { profileId: input.profileId, unitId: input.unitId } }).catch(() => undefined);
        throw error;
      }
    }),
    pending: protectedProcedure.query(async ({ ctx }) => {
      await requireOperationsManager(ctx.user);
      return listPendingApprovals();
    }),
    myRequests: protectedProcedure.query(async ({ ctx }) => {
      return listMyApprovalRequests(ctx.user.id);
    }),
    approveAll: protectedProcedure.input(z.object({ unitId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const roles = await requireOperationsManager(ctx.user);
      return approveAllPendingApprovals({ actorUserId: ctx.user.id, roles, unitId: input.unitId });
    }),
    decide: protectedProcedure.input(z.object({ approvalId: z.number().int().positive(), decision: z.enum(["approved", "returned", "rejected"]), note: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      const roles = await requireOperationsManager(ctx.user);
      const approvals = await listPendingApprovals();
      const approval = approvals.find(item => item.id === input.approvalId);
      if (!approval) throw new TRPCError({ code: "NOT_FOUND", message: "طلب الاعتماد غير موجود أو لم يعد معلقاً." });
      const isManagerAssignment = approval.entityType === "department_manager_assignment";
      const currentRole = approval.currentRole as ApprovalRole;
      if (isManagerAssignment) {
        if (!canActOnManagerAssignmentApproval(roles.find(role => ["human_resources_manager", "court_secretary", "court_president"].includes(role)) ?? "court_president", currentRole as ManagerAssignmentApprovalRole)) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك الدور المطلوب لهذه الخطوة من اعتماد تسكين مدير القسم." });
      } else if (!roles.find(role => canActOnApproval(role, currentRole))) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك الدور المطلوب لهذه الخطوة من الاعتماد." });
      const nextRole = input.decision === "approved" ? (isManagerAssignment ? nextManagerAssignmentApprovalRole(currentRole as ManagerAssignmentApprovalRole) : nextApprovalRole(currentRole)) : null;
      await decideApproval({ approvalId: input.approvalId, actorUserId: ctx.user.id, decision: input.decision, note: input.note, nextRole });
      if (isManagerAssignment && input.decision === "approved" && !nextRole) await applyManagerAssignmentApproval(input.approvalId, ctx.user.id);
      return { success: true, nextRole };
    }),
  }),

  archive: router({
    governance: protectedProcedure.input(z.object({ entityType: z.enum(["task", "delay", "decision", "disciplinary_action", "score_adjustment"]).optional(), status: z.enum(["returned", "approved", "rejected", "cancelled"]).optional(), limit: z.number().int().min(1).max(300).optional() }).optional()).query(async ({ ctx, input }) => {
      await requirePlatformView(ctx.user);
      return listGovernanceArchive(input);
    }),
  }),

  scoring: router({
    list: protectedProcedure.input(z.object({ personType: z.enum(["administrative", "trainee"]).optional() }).optional()).query(async ({ ctx, input }) => {
      await requirePlatformView(ctx.user);
      return listScoreEvents(200, input?.personType);
    }),
    record: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), taskId: z.number().int().positive().optional(), delayRecordId: z.number().int().positive().optional(), points: z.number().int().min(-100).max(100), reason: z.string().trim().min(3).max(255) })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "edit");
      return { id: await recordScoreEvent({ ...input, createdByUserId: ctx.user.id }) };
    }),
  }),

  achievements: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      await requirePermission(ctx.user, "view");
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف شخصي لعرض سجل الإنجازات." });
      const events = await listScoreEventsForProfile(profile.id);
      const summary = events.reduce((acc, item) => ({
        positive: acc.positive + (item.event.points > 0 ? item.event.points : 0),
        negative: acc.negative + (item.event.points < 0 ? Math.abs(item.event.points) : 0),
        positiveEventCount: acc.positiveEventCount + (item.event.points > 0 ? 1 : 0),
        negativeEventCount: acc.negativeEventCount + (item.event.points < 0 ? 1 : 0),
      }), { positive: 0, negative: 0, positiveEventCount: 0, negativeEventCount: 0 });
      const balance = summary.positive - summary.negative;
      return { profile: { id: profile.id, fullName: profile.fullName, personType: profile.personType }, events, reports: await listOperationalReportsForProfile(profile.id), summary: { positive: summary.positive, negative: summary.negative, balance }, performance: evaluatePerformance({ ...summary, balance }), weightedPerformance: calculateWeightedPerformance({}) };
    }),
  }),

  trainees: router({
    templates: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listTaskTemplatesForUnit(1);
      const roles = await rolesForUser(ctx.user);
      const managedUnits = await managedUnitIdsForUser(ctx.user);
      if (roles.includes("trainee_affairs_manager") || managedUnits.includes(1)) return listTaskTemplatesForUnit(1);
      const profile = await getProfileForUser(ctx.user.id);
      if (permission === "employee" && profile?.unitId === 1) return listTaskTemplatesForUnit(1);
      return [];
    }),
    overview: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listTraineeOperations();
      const { profile } = await requirePersonalWorkspace(ctx.user);
      return listTraineeOperations(profile.id);
    }),
    setDuration: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), expectedStartAt: z.date(), durationDays: z.number().int().min(1).max(365), trainingJudge: z.string().trim().max(240).optional(), supervisingJudgeProfileId: z.number().int().positive().optional(), courtTrack: z.string().trim().max(160).optional() })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "edit");
      return { expectedEndAt: await setTraineeAssignment({ ...input, actorUserId: ctx.user.id }) };
    }),
    renew: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), startAt: z.date(), durationDays: z.number().int().min(1).max(365) })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "edit");
      return { expectedEndAt: await renewTraineeAssignment({ ...input, actorUserId: ctx.user.id }) };
    }),
    runDueSoonCheck: protectedProcedure.mutation(async ({ ctx }) => {
      await requirePermission(ctx.user, "edit");
      return createDueSoonNotifications();
    }),
  }),

  reports: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      await requirePermission(ctx.user, "view");
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف شخصي لعرض تقاريرك." });
      return listOperationalReportsForProfile(profile.id);
    }),
    operational: protectedProcedure.input(z.object({ period: z.enum(["daily", "weekly", "monthly", "historical"]), unitId: z.number().int().positive().optional(), taskStatus: z.enum(["new", "in_progress", "under_review", "completed", "overdue", "cancelled"]).optional(), personType: z.enum(["administrative", "trainee"]).optional() })).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return getOperationalReport(input);
      const roles = await rolesForUser(ctx.user);
      if (roles.includes("performance_monitor")) return getOperationalReport(input);
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (managedUnitIds.length) {
        const unitId = input.unitId ?? managedUnitIds[0];
        if (!unitId || !managedUnitIds.includes(unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "يمكن لمدير القسم الاطلاع على تقرير وحدته المفوضة فقط." });
        return getOperationalReport({ ...input, unitId });
      }
      throw new TRPCError({ code: "FORBIDDEN", message: "التقارير التشغيلية متاحة للقيادة أو مدير القسم أو مراقبة الأداء." });
    }),
    judicialFormations: protectedProcedure.input(z.object({ period: z.enum(["daily", "weekly", "monthly", "historical"]), unitId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return getJudicialFormationReport(input);
      const roles = await rolesForUser(ctx.user);
      if (roles.includes("performance_monitor")) return getJudicialFormationReport(input);
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (managedUnitIds.length) {
        const unitId = input.unitId ?? managedUnitIds[0];
        if (!unitId || !managedUnitIds.includes(unitId)) throw new TRPCError({ code: "FORBIDDEN", message: "يمكن لمدير القسم الاطلاع على تشكيلات وحدته المفوضة فقط." });
        return getJudicialFormationReport({ ...input, unitId });
      }
      throw new TRPCError({ code: "FORBIDDEN", message: "تقارير التشكيلات القضائية متاحة للقيادة أو مدير القسم أو مراقبة الأداء." });
    }),
    evaluationQueue: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listPerformanceReportEvaluations();
      const roles = await rolesForUser(ctx.user);
      if (roles.includes("performance_monitor")) return listPerformanceReportEvaluations();
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (!managedUnitIds.length) throw new TRPCError({ code: "FORBIDDEN", message: "تقييم تقارير الأداء متاح لمدير القسم ضمن نطاقه أو لمراقبة الأداء أو للقيادة." });
      return listPerformanceReportEvaluations({ unitIds: managedUnitIds });
    }),
    reviewEvaluation: protectedProcedure.input(z.object({ documentId: z.number().int().positive(), decision: z.enum(["accepted", "returned", "rejected"]), managerPoints: z.number().int().min(0).max(10).optional(), managerNote: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "edit");
      const evaluation = await getPerformanceReportEvaluation(input.documentId);
      if (!evaluation) throw new TRPCError({ code: "NOT_FOUND", message: "تقييم التقرير المطلوب غير موجود." });
      const hasLeadershipScope = await hasLeadershipPlatformScope(ctx.user, permission);
      const roles = await rolesForUser(ctx.user);
      const isPerformanceMonitor = roles.includes("performance_monitor");
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (!hasLeadershipScope && !isPerformanceMonitor && (!evaluation.document.unitId || !managedUnitIds.includes(evaluation.document.unitId))) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك اعتماد تقرير خارج وحدتك المفوضة." });
      return reviewPerformanceReportEvaluation({ ...input, reviewerUserId: ctx.user.id });
    }),
    upload: protectedProcedure.input(z.object({ title: z.string().trim().min(3).max(255), originalName: z.string().trim().min(5).max(255), mimeType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"]), contentBase64: z.string().min(20).max(11_200_000), reportPeriod: z.enum(["daily", "weekly", "monthly"]).default("monthly"), unitId: z.number().int().positive().optional(), profileId: z.number().int().positive().optional(), linkedTaskId: z.number().int().positive().optional(), createTasksForTargetUnit: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "edit");
      const ownProfile = await getProfileForUser(ctx.user.id);
      if (!ownProfile) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ربط الحساب بملف شخصي لرفع تقرير إنجاز." });
      const roles = await rolesForUser(ctx.user);
      const isPerformanceMonitor = roles.includes("performance_monitor");
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      const targetProfile = input.profileId ? await getProfileById(input.profileId) : ownProfile;
      if (!targetProfile) throw new TRPCError({ code: "NOT_FOUND", message: "ملف الموظف المحدد غير موجود." });
      const targetUnitId = input.unitId ?? targetProfile.unitId ?? ownProfile.unitId ?? undefined;
      if (!isPerformanceMonitor && targetProfile.id !== ownProfile.id && !managedUnitIds.includes(targetProfile.unitId ?? -1)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك رفع تقرير باسم ملف خارج نطاقك." });
      if (!isPerformanceMonitor && managedUnitIds.length && (!targetUnitId || !managedUnitIds.includes(targetUnitId))) throw new TRPCError({ code: "FORBIDDEN", message: "يجب أن يرتبط تقرير مدير القسم بوحدة مفوضة له." });
      if (!isPerformanceMonitor && !managedUnitIds.length && targetUnitId !== ownProfile.unitId) throw new TRPCError({ code: "FORBIDDEN", message: "يمكنك رفع تقرير مرتبط بوحدتك فقط." });
      if (input.createTasksForTargetUnit && !isPerformanceMonitor) throw new TRPCError({ code: "FORBIDDEN", message: "تحويل التقرير إلى مهام موزعة محصور بصلاحية مراقبة الأداء." });
      if (input.createTasksForTargetUnit && !targetUnitId) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر القسم المستهدف قبل إنشاء المهام من تقرير مراقبة الأداء." });
      return createOperationalReport({ ...input, profileId: targetProfile.id, unitId: targetUnitId, actorUserId: ctx.user.id });
    }),
  }),

  units: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listOrganizationUnits();
      const roles = await rolesForUser(ctx.user);
      const allUnits = await listOrganizationUnits();
      if (roles.includes("performance_monitor")) return allUnits;
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (managedUnitIds.length) return allUnits.filter(unit => managedUnitIds.includes(unit.id));
      const profile = await getProfileForUser(ctx.user.id);
      return profile?.unitId ? allUnits.filter(unit => unit.id === profile.unitId) : [];
    }),
    setActive: protectedProcedure.input(z.object({ unitId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      const roles = await rolesForUser(ctx.user);
      const permission = await permissionForUser(ctx.user);
      if (permission !== "full_control" && !roles.some(role => role === "court_president" || role === "court_secretary" || role === "human_resources_manager")) throw new TRPCError({ code: "FORBIDDEN", message: "إيقاف أو تفعيل قسم متاح للمالك ورئيس المحكمة والأمين والموارد البشرية فقط." });
      return setOrganizationUnitActive({ ...input, actorUserId: ctx.user.id });
    }),
    archived: protectedProcedure.query(async ({ ctx }) => {
      const permission = await permissionForUser(ctx.user);
      const roles = await rolesForUser(ctx.user);
      if (permission !== "full_control" && !roles.some(role => role === "court_president" || role === "court_secretary")) throw new TRPCError({ code: "FORBIDDEN", message: "عرض الأقسام المؤرشفة متاح للقيادة العليا فقط." });
      return listOrganizationUnitsIncludingArchived();
    }),
  }),

  hierarchy: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (permission === "trainee") return [];
      return listAdministrativeLevels();
    }),
    save: protectedProcedure.input(z.object({ levelId: z.number().int().positive().optional(), title: z.string().trim().min(2).max(160), managerProfileId: z.number().int().positive(), sequenceOrder: z.number().int().min(1).max(99) })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      return { id: await saveAdministrativeLevel({ ...input, createdByUserId: ctx.user.id }) };
    }),
  }),

  correspondence: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listCorrespondences();
      const { profile } = await requirePersonalWorkspace(ctx.user);
      return listCorrespondencesForProfile(profile.id);
    }),
    create: protectedProcedure.input(z.object({ correspondenceType: z.enum(["request", "letter"]), senderProfileId: z.number().int().positive(), unitId: z.number().int().positive(), departmentManagerProfileId: z.number().int().positive(), traineeCopyProfileId: z.number().int().positive().optional(), copyProfileIds: z.array(z.number().int().positive()).max(100).optional(), recipientProfileId: z.number().int().positive(), managerProfileIds: z.array(z.number().int().positive()).min(1).max(12), subject: z.string().trim().min(3).max(255), body: z.string().trim().min(3).max(10_000), attachments: z.array(z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(120), contentBase64: z.string().min(1).max(12_000_000) })).max(5).optional() })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "edit");
      const ownProfile = await getProfileForUser(ctx.user.id);
      const roles = await rolesForUser(ctx.user);
      if (input.senderProfileId !== ownProfile?.id && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن إنشاء طلب باسم ملف شخص آخر." });
      const recipient = await getProfileById(input.recipientProfileId);
      const manager = await getProfileById(input.departmentManagerProfileId);
      if (!recipient || recipient.unitId !== input.unitId) throw new TRPCError({ code: "BAD_REQUEST", message: "يجب أن يكون المستلم من القسم المختار." });
      if (!manager || manager.unitId !== input.unitId) throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار مدير القسم من القسم نفسه." });
      return createCorrespondence({ ...input, actorUserId: ctx.user.id });
    }),
    attachments: router({
      list: protectedProcedure.input(z.object({ correspondenceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        const permission = await requirePermission(ctx.user, "view");
        if (await hasLeadershipPlatformScope(ctx.user, permission)) return listCorrespondenceAttachments(input.correspondenceId);
        const { profile } = await requirePersonalWorkspace(ctx.user);
        const visible = await listCorrespondencesForProfile(profile.id);
        if (!visible.some(row => row.correspondence.id === input.correspondenceId)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية عرض مرفقات هذا الطلب." });
        return listCorrespondenceAttachments(input.correspondenceId);
      }),
      upload: protectedProcedure.input(z.object({ correspondenceId: z.number().int().positive(), attachment: z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(120), contentBase64: z.string().min(1).max(12_000_000) }) })).mutation(async ({ ctx, input }) => {
        await requirePermission(ctx.user, "edit");
        const { profile } = await requirePersonalWorkspace(ctx.user);
        const correspondence = await getCorrespondenceById(input.correspondenceId);
        const roles = await rolesForUser(ctx.user);
        if (!correspondence) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب أو المراسلة غير موجود." });
        if (correspondence.senderProfileId !== profile.id && !canManageOperations(roles)) throw new TRPCError({ code: "FORBIDDEN", message: "يضيف المرسل أو المدير المخول المرفقات فقط." });
        return addCorrespondenceAttachment({ correspondenceId: input.correspondenceId, actorUserId: ctx.user.id, uploaderProfileId: profile.id, attachment: input.attachment });
      }),
    }),
    route: protectedProcedure.input(z.object({ correspondenceId: z.number().int().positive(), action: z.enum(["forwarded", "approved", "returned", "rejected"]), note: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      await routeCorrespondence({ ...input, actorUserId: ctx.user.id });
      return { success: true };
    }),
  }),

  loginPolicy: router({
    /**
     * فحص عام قبل الدخول: هل يُقبل هذا البريد؟
     * يقبل النطاق الرسمي أو بريد مالك رَكيزة، وكذلك أي بريد يملك في قاعدة البيانات
     * دور مالك أو منحة تحكم كامل — ولا يكشف أي بيانات أخرى عن الحساب.
     */
    check: publicProcedure.input(z.object({ email: z.string().trim().max(320) })).query(async ({ input }) => {
      const allowance = await evaluateLoginAllowance({ email: input.email });
      return { allowed: allowance.allowed, isOwner: allowance.isOwner, reason: allowance.reason };
    }),
  }),

  notifications: router({
    pushConfig: protectedProcedure.query(() => pushReadiness()),
    fcmSubscribe: protectedProcedure.input(z.object({ token: z.string().min(40).max(1024), platform: z.string().max(32).optional(), userAgent: z.string().max(512).optional() })).mutation(async ({ ctx, input }) => {
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "لا يوجد ملف شخصي مرتبط بالحساب الحالي." });
      return upsertFcmToken({ profileId: profile.id, token: input.token, platform: input.platform, userAgent: input.userAgent });
    }),
    fcmUnsubscribe: protectedProcedure.input(z.object({ token: z.string().min(40).max(1024) })).mutation(async ({ ctx, input }) => {
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "لا يوجد ملف شخصي مرتبط بالحساب الحالي." });
      return removeFcmToken(profile.id, input.token);
    }),
    fcmTest: protectedProcedure.mutation(async ({ ctx }) => {
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "لا يوجد ملف شخصي مرتبط بالحساب الحالي." });
      const result = await sendFcmToProfile(profile.id, { title: "اختبار FCM من رَكيزة", body: "إذا ظهرت هذه الرسالة والتطبيق مغلق، يعمل مسار Firebase Cloud Messaging.", url: "/", tag: `fcm-test-${profile.id}`, actions: [{ action: "open-tasks", title: "عرض المهام" }, { action: "open-notifications", title: "مركز التنبيهات" }] });
      if (result.skipped) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "إعدادات FCM على الخادم غير مكتملة." });
      if (!result.sent) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يوجد FCM Token مسجل لهذا الجهاز. فعّل إشعارات Firebase أولاً." });
      return { success: true as const };
    }),
    activity: protectedProcedure.input(z.object({ activityState: z.enum(["active", "chatting", "inactive"]) })).mutation(({ ctx, input }) => recordUserActivity({ userId: ctx.user.id, activityState: input.activityState })),
    subscribe: protectedProcedure.input(z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().min(16).max(512), auth: z.string().min(8).max(512) }), userAgent: z.string().max(512).optional() })).mutation(async ({ ctx, input }) => {
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "لا يوجد ملف شخصي مرتبط بالحساب الحالي." });
      return upsertPushSubscription({ profileId: profile.id, subscription: input, userAgent: input.userAgent });
    }),
    unsubscribe: protectedProcedure.input(z.object({ endpoint: z.string().url().max(2048) })).mutation(async ({ ctx, input }) => {
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "لا يوجد ملف شخصي مرتبط بالحساب الحالي." });
      return removePushSubscription(profile.id, input.endpoint);
    }),
    test: protectedProcedure.mutation(async ({ ctx }) => {
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "لا يوجد ملف شخصي مرتبط بالحساب الحالي." });
      const result = await sendPushForNotification(profile.id, { title: "اختبار إشعارات رَكيزة", body: "إذا ظهرت هذه الرسالة والتطبيق مغلق، فالإشعارات الخلفية تعمل على هذا الجهاز.", url: "/", tag: `push-test-${profile.id}`, actions: [{ action: "open-tasks", title: "عرض المهام" }, { action: "open-notifications", title: "مركز التنبيهات" }] });
      if (result.skipped) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "خدمة الإشعارات غير مكتملة على الخادم حالياً. راجع إعدادات Web Push ثم أعد المحاولة." });
      if (!result.sent) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لم يُعثر على اشتراك نشط لهذا الجهاز. اضغط إيقاف ثم فعّل التنبيهات مرة أخرى." });
      return { success: true as const };
    }),
    listMine: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getProfileForUser(ctx.user.id);
      return profile ? listNotificationsForProfile(profile.id) : [];
    }),
    markRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const profile = await getProfileForUser(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "لا يوجد ملف شخصي مرتبط بالحساب الحالي." });
      await markNotificationRead(input.notificationId, profile.id);
      return { success: true };
    }),
  }),

  disciplinary: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const { profile } = await requirePersonalWorkspace(ctx.user);
      return listPersonalDisciplinaryActions(profile.id);
    }),
  }),

  shifts: router({
    list: protectedProcedure.query(async ({ ctx }) => { await requireAttendancePolicyAccess(ctx.user); return listWorkShifts(); }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(160), startMinutes: z.number().int().min(0).max(1439), endMinutes: z.number().int().min(1).max(1439), fingerprintOpenMinutes: z.number().int().min(0).max(1439), lateStartMinutes: z.number().int().min(0).max(1439), morningCompensationDeadlineMinutes: z.number().int().min(0).max(1439), actualEndMinutes: z.number().int().min(0).max(1439), eveningCompensationDeadlineMinutes: z.number().int().min(0).max(1439), fingerprintCloseMinutes: z.number().int().min(0).max(1439), workingDays: z.string().regex(/^[0-6](,[0-6])*$/), isDefault: z.boolean().optional() })).mutation(async ({ ctx, input }) => { const { permission, roles } = await requireAttendancePolicyAccess(ctx.user); if (permission !== "full_control" && !roles.includes("human_resources_manager")) throw new TRPCError({ code: "FORBIDDEN", message: "تعديل الورديات متاح للموارد البشرية أو مالك المنصة فقط." }); return updateWorkShift({ ...input, actorUserId: ctx.user.id }); }),
  }),

  attendance: router({
    list: protectedProcedure.input(z.object({ date: z.date().optional() }).optional()).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listAttendance(input?.date);
      const { profile } = await requireSelfAttendanceProfile(ctx.user);
      return listAttendanceForProfile(profile.id, input?.date);
    }),
    self: protectedProcedure.query(async ({ ctx }) => {
      const { profile } = await requireSelfAttendanceProfile(ctx.user);
      return profile;
    }),
    currentWindow: protectedProcedure.query(async ({ ctx }) => {
      const { profile } = await requireSelfAttendanceProfile(ctx.user);
      const eligible = profile.status !== "inactive" && profile.status !== "on_leave";
      if (!eligible) return { kind: "none" as const, shiftName: null };
      return getAttendanceWindowForProfile(profile.id);
    }),
    serverClock: protectedProcedure.query(() => ({ now: new Date() })),
    remoteReport: protectedProcedure.input(z.object({ startAt: z.date().optional(), endAt: z.date().optional(), unitId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listRemoteAttendanceReport({ startAt: input?.startAt, endAt: input?.endAt, unitIds: input?.unitId ? [input.unitId] : undefined });
      const roles = await rolesForUser(ctx.user);
      if (roles.includes("court_president") || roles.includes("assistant_president") || roles.includes("court_secretary")) return listRemoteAttendanceReport({ startAt: input?.startAt, endAt: input?.endAt, unitIds: input?.unitId ? [input.unitId] : undefined });
      const managedUnitIds = await managedUnitIdsForUser(ctx.user);
      if (!managedUnitIds.length || (input?.unitId && !managedUnitIds.includes(input.unitId))) throw new TRPCError({ code: "FORBIDDEN", message: "تقرير حضور العاملين عن بعد متاح لمدير الوحدة أو المفوض منه داخل نطاقه فقط." });
      return listRemoteAttendanceReport({ startAt: input?.startAt, endAt: input?.endAt, unitIds: input?.unitId ? [input.unitId] : managedUnitIds });
    }),
    record: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), recordDate: z.date(), checkInAt: z.date().optional(), checkOutAt: z.date().optional(), status: z.enum(["present", "late", "absent", "excused", "on_leave"]), note: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      try {
        const permission = await requirePermission(ctx.user, "view");
        const isLeadership = await hasLeadershipPlatformScope(ctx.user, permission);
        const selfProfile = await getProfileForUser(ctx.user.id);
        const isSelfRecord = selfProfile?.id === input.profileId;
        if (isSelfRecord) {
          const { profile } = await requireSelfAttendanceProfile(ctx.user);
          const hasEligibleAttendanceMode = profile.status !== "inactive" && profile.status !== "on_leave";
          if (!hasEligibleAttendanceMode || input.profileId !== profile.id) throw new TRPCError({ code: "FORBIDDEN", message: "يقتصر تسجيل الحضور الذاتي على ملفك النشط المرتبط بالحساب." });
          const attendanceWindow = await getAttendanceWindowForProfile(profile.id);
          if (attendanceWindow.kind === "check_out") throw new TRPCError({ code: "CONFLICT", message: "نافذة الانصراف مفتوحة الآن. سجّل انصرافك بدلاً من حضور جديد." });
          if (attendanceWindow.kind !== "check_in" && !attendanceWindow.workingDay) throw new TRPCError({ code: "CONFLICT", message: "تسجيل الحضور الذاتي متاح في أيام الوردية فقط." });
        } else if (!isLeadership) {
          throw new TRPCError({ code: "FORBIDDEN", message: "يقتصر تسجيل الحضور الذاتي على ملفك المرتبط، ولا يمكنك تسجيل حضور ملف آخر." });
        }
        const serverNow = new Date();
        await recordAttendance({ ...input, recordDate: serverNow, checkInAt: isSelfRecord ? serverNow : input.checkInAt, checkOutAt: isSelfRecord ? undefined : input.checkOutAt, autoClassify: isSelfRecord, actorUserId: ctx.user.id });
        return { success: true };
      } catch (error) {
        await notifyPlatformOwnerSecurityAlert({ actorUserId: ctx.user.id, action: "attendance.record_attempt_failed", entityType: "attendance", entityId: input.profileId }).catch(() => undefined);
        throw error;
      }
    }),
    confirmationConfig: protectedProcedure.query(async ({ ctx }) => {
      await requireAttendancePolicyAccess(ctx.user);
      return getAttendanceConfirmationConfig();
    }),
    updateConfirmationConfig: protectedProcedure.input(z.object({ isActive: z.boolean().optional(), targetProfileId: z.number().int().positive().nullable().optional(), audience: z.enum(["employees", "trainees", "judges", "all", "employees,trainees", "employees,judges", "trainees,judges", "employees,trainees,judges"]).optional(), shiftEnabled: z.boolean().optional() }).refine(input => input.isActive !== undefined || input.targetProfileId !== undefined || input.audience !== undefined || input.shiftEnabled !== undefined, "يلزم تحديد تغيير في سياسة الحضور.")).mutation(async ({ ctx, input }) => {
      const { roles, permission } = await requireAttendancePolicyAccess(ctx.user);
      if (input.targetProfileId !== undefined && !roles.includes("court_president")) throw new TRPCError({ code: "FORBIDDEN", message: "تخصيص موظف معين في تأكيد الحضور متاح للرئيس فقط." });
      if (input.audience !== undefined && !roles.some(role => role === "court_president" || role === "court_secretary") && permission !== "full_control") throw new TRPCError({ code: "FORBIDDEN", message: "تعديل نطاق الحضور عن بُعد متاح للمالك والرئيس والأمين فقط." });
      if (input.shiftEnabled !== undefined && !roles.some(role => role === "court_secretary" || role === "human_resources_manager") && permission !== "full_control") throw new TRPCError({ code: "FORBIDDEN", message: "إدارة نظام الورديات متاحة للمالك والأمين والموارد البشرية فقط." });
      if (input.isActive === true) {
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        if (!sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "جلسة المستخدم غير متاحة لتفعيل إرسال الحضور." });
        await ensureAttendanceConfirmationHeartbeatJob({ userSession: sessionToken });
      }
      return setAttendanceConfirmationConfig({ ...input, actorUserId: ctx.user.id });
    }),
    checkout: protectedProcedure.mutation(async ({ ctx }) => {
      const { profile } = await requireSelfAttendanceProfile(ctx.user);
      const eligible = profile.status !== "inactive" && profile.status !== "on_leave";
      if (!eligible) throw new TRPCError({ code: "FORBIDDEN", message: "تسجيل الانصراف الذاتي متاح لملفك النشط فقط." });
      const attendanceWindow = await getAttendanceWindowForProfile(profile.id);
      if (attendanceWindow.kind === "check_in") throw new TRPCError({ code: "CONFLICT", message: "تسجيل الانصراف الذاتي متاح فقط خلال نافذة الانصراف المحددة في ورديتك." });
      if (attendanceWindow.kind !== "check_out" && !attendanceWindow.workingDay) throw new TRPCError({ code: "CONFLICT", message: "تسجيل الانصراف الذاتي متاح في أيام الوردية فقط." });
      return recordAttendanceCheckout({ profileId: profile.id, checkOutAt: new Date(), actorUserId: ctx.user.id });
    }),
  }),

  leave: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listLeaveRequests();
      const { profile } = await requirePersonalWorkspace(ctx.user);
      return listLeaveRequestsForProfile(profile.id);
    }),
    substitutes: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "edit");
      const profile = await getProfileForUser(ctx.user.id);
      if (await hasLeadershipPlatformScope(ctx.user, permission)) {
        return listPlatformSubstitutes(profile?.id);
      }
      if (permission !== "employee") return [];
      const workspace = await requirePersonalWorkspace(ctx.user);
      if (workspace.profile.personType !== "administrative") return [];
      return listAdministrativeSubstitutes(workspace.profile.unitId, workspace.profile.id);
    }),
    submit: protectedProcedure.input(z.object({ profileId: z.number().int().positive(), requestType: z.enum(["leave", "permission"]), startAt: z.date(), endAt: z.date(), substituteProfileId: z.number().int().positive().optional(), note: z.string().trim().max(3000).optional() })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "edit");
      if (!await hasLeadershipPlatformScope(ctx.user, permission)) {
        const { profile } = await requirePersonalWorkspace(ctx.user);
        if (profile.id !== input.profileId) throw new TRPCError({ code: "FORBIDDEN", message: "يمكنك تقديم طلب مرتبط بملفك الشخصي فقط." });
      }
      return { id: await submitLeaveRequest({ ...input, requestedByUserId: ctx.user.id }) };
    }),
    review: protectedProcedure.input(z.object({ leaveRequestId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) })).mutation(async ({ ctx, input }) => {
      await requireOperationsManager(ctx.user);
      await reviewLeaveRequest({ ...input, reviewedByUserId: ctx.user.id });
      return { success: true };
    }),
    refreshStatuses: protectedProcedure.mutation(async ({ ctx }) => {
      await requireOperationsManager(ctx.user);
      return activateScheduledLeaveStatuses();
    }),
  }),

  communications: router({
    templates: router({
      list: protectedProcedure.query(({ ctx }) => listManagerTemplates(ctx.user.id)),
      create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(180), subject: z.string().trim().min(2).max(255), body: z.string().trim().min(2).max(20_000), unitId: z.number().int().positive().optional() })).mutation(({ ctx, input }) => createManagerTemplate({ userId: ctx.user.id, ...input })),
      update: protectedProcedure.input(z.object({ templateId: z.number().int().positive(), name: z.string().trim().min(2).max(180), subject: z.string().trim().min(2).max(255), body: z.string().trim().min(2).max(20_000) })).mutation(({ ctx, input }) => updateManagerTemplate({ userId: ctx.user.id, ...input })),
      archive: protectedProcedure.input(z.object({ templateId: z.number().int().positive() })).mutation(({ ctx, input }) => archiveManagerTemplate({ userId: ctx.user.id, ...input })),
    }),
    units: protectedProcedure.query(() => listCommunicationUnits()),
    peopleSearch: protectedProcedure.input(z.object({ query: z.string().trim().max(120).optional(), unitId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => searchInternalPeople({ userId: ctx.user.id, ...input })),
    frequentContacts: protectedProcedure.query(({ ctx }) => listFrequentContacts(ctx.user.id)),
    createFlexible: protectedProcedure.input(z.object({ correspondenceType: z.enum(["request", "letter"]), participantProfileIds: z.array(z.number().int().positive()).min(1).max(50), subject: z.string().trim().min(2).max(255), body: z.string().trim().min(1).max(20_000) })).mutation(({ ctx, input }) => createFlexibleCorrespondence({ userId: ctx.user.id, ...input })),
    conversations: router({
      unreadCount: protectedProcedure.query(({ ctx }) => getUnreadConversationCount(ctx.user.id)),
      list: protectedProcedure.query(({ ctx }) => listInternalConversations(ctx.user.id)),
      get: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(({ ctx, input }) => getInternalConversation(ctx.user.id, input.conversationId)),
      searchMessages: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), query: z.string().trim().min(2).max(160) })).query(({ ctx, input }) => searchInternalConversationMessages({ userId: ctx.user.id, ...input })),
      setPinnedMessage: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), messageId: z.number().int().positive().nullable() })).mutation(({ ctx, input }) => setInternalConversationPinnedMessage({ userId: ctx.user.id, ...input })),
      toggleReaction: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), messageId: z.number().int().positive(), reaction: z.enum(["👍", "✅", "👀", "🙏", "⚠️"]) })).mutation(({ ctx, input }) => toggleInternalConversationMessageReaction({ userId: ctx.user.id, ...input })),
      createCustomGroup: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(255), participantProfileIds: z.array(z.number().int().positive()).min(1).max(100), body: z.string().trim().max(20_000).optional() })).mutation(({ ctx, input }) => createCustomConversation({ userId: ctx.user.id, ...input })),
      create: protectedProcedure.input(z.object({ participantProfileIds: z.array(z.number().int().positive()).min(1).max(50), subject: z.string().trim().max(255).optional(), body: z.string().trim().min(1).max(20_000), conversationType: z.enum(["direct", "department", "custom", "general", "task"]).optional(), taskId: z.number().int().positive().optional(), unitId: z.number().int().positive().nullable().optional(), attachments: z.array(z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(120), contentBase64: z.string().max(12_000_000) })).max(5).optional() })).mutation(async ({ ctx, input }) => {
        // RBAC الدردشات: الموظف العادي ينشئ محادثات فردية فقط؛ المجموعات ومحادثات القسم للمدراء والقيادة.
        if (input.conversationType && ["custom", "department", "general"].includes(input.conversationType)) {
          const permission = await permissionForUser(ctx.user);
          const roles = await rolesForUser(ctx.user);
          const canCreateGroup = permission === "full_control" || roles.some(role => ["court_president", "assistant_president", "court_secretary", "department_manager"].includes(role));
          if (!canCreateGroup) throw new TRPCError({ code: "FORBIDDEN", message: "إنشاء المجموعات أو محادثات القسم متاح لرئيس القسم أو قادة المنصة فقط." });
        }
        return createInternalConversation({ userId: ctx.user.id, ...input });
      }),
      setTyping: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), isTyping: z.boolean() })).mutation(({ ctx, input }) => setInternalConversationTyping({ userId: ctx.user.id, ...input })),
      send: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), body: z.string().trim().max(20_000), replyToMessageId: z.number().int().positive().nullable().optional(), attachments: z.array(z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(120), contentBase64: z.string().max(12_000_000) })).max(5).optional(), zipAttachments: z.array(z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(120), contentBase64: z.string().max(12_000_000) })).min(6).max(25).optional() }).refine(input => Boolean(input.body) || Boolean(input.attachments?.length) || Boolean(input.zipAttachments?.length), { message: "اكتب رسالة أو أرفق ملفاً واحداً على الأقل." }).refine(input => !(input.attachments?.length && input.zipAttachments?.length), { message: "اختر مرفقات عادية أو حزمة ZIP تلقائية في الرسالة نفسها، وليس كليهما." })).mutation(({ ctx, input }) => sendInternalMessage({ userId: ctx.user.id, ...input })),
      forward: protectedProcedure.input(z.object({ sourceMessageId: z.number().int().positive(), targetConversationId: z.number().int().positive(), note: z.string().trim().max(1_000).optional() })).mutation(({ ctx, input }) => forwardInternalConversationMessage({ userId: ctx.user.id, ...input })),
    }),
    exports: router({
      list: protectedProcedure.query(({ ctx }) => listDataExportJobs(ctx.user.id)),
      request: protectedProcedure.input(z.object({ unitId: z.number().int().positive().optional() })).mutation(({ ctx, input }) => requestUnitDataExport({ userId: ctx.user.id, ...input })),
      build: protectedProcedure.input(z.object({ jobId: z.number().int().positive() })).mutation(({ ctx, input }) => buildUnitDataExport({ userId: ctx.user.id, ...input })),
    }),
  }),
  internalMail: router({
    folderCounts: protectedProcedure.query(({ ctx }) => getInternalMailFolderCounts(ctx.user.id)),
    list: protectedProcedure.input(z.object({ folder: z.enum(["inbox", "sent", "drafts", "starred", "archive", "trash"]), search: z.string().trim().max(120).optional(), sender: z.string().trim().max(120).optional(), subject: z.string().trim().max(120).optional(), category: z.string().trim().max(80).optional(), fromDate: z.date().optional(), toDate: z.date().optional(), sortBy: z.enum(["date", "sender", "subject", "importance"]).optional(), sortDir: z.enum(["asc", "desc"]).optional() }).refine(input => !input.fromDate || !input.toDate || input.fromDate <= input.toDate, { message: "يجب أن يكون تاريخ البداية قبل تاريخ النهاية." })).query(({ ctx, input }) => listInternalMail({ userId: ctx.user.id, ...input })),
    get: protectedProcedure.input(z.object({ messageId: z.number().int().positive() })).query(({ ctx, input }) => getInternalMailMessage({ userId: ctx.user.id, ...input })),
    summarize: protectedProcedure.input(z.object({ messageId: z.number().int().positive() })).mutation(({ ctx, input }) => summarizeInternalMailMessage({ userId: ctx.user.id, ...input })),
    assistant: protectedProcedure.input(z.object({ messageId: z.number().int().positive(), mode: z.enum(["reply", "proofread"]), tone: z.enum(["formal", "concise"]).optional() })).mutation(({ ctx, input }) => suggestInternalMailAssistant({ userId: ctx.user.id, ...input })),
    preferences: protectedProcedure.query(({ ctx }) => getInternalMailPreferences(ctx.user.id)),
    updatePreferences: protectedProcedure.input(z.object({ signature: z.string().max(3_000) })).mutation(({ ctx, input }) => updateInternalMailPreferences({ userId: ctx.user.id, ...input })),
    uploadSignatureImage: protectedProcedure.input(z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), contentBase64: z.string().min(20).max(2_800_000) })).mutation(({ ctx, input }) => uploadInternalMailSignatureImage({ userId: ctx.user.id, image: input })),
    updateAssistantPreferences: protectedProcedure.input(z.object({ mode: z.enum(["off", "draft", "auto_reply", "auto_forward"]), replyTone: z.enum(["formal", "concise"]).optional(), forwardProfileId: z.number().int().positive().nullable().optional(), subjectContains: z.string().trim().max(160).nullable().optional(), authorizationConfirmed: z.boolean().optional() })).mutation(({ ctx, input }) => updateInternalMailAssistantPreferences({ userId: ctx.user.id, ...input })),
    updateContact: protectedProcedure.input(z.object({ contactProfileId: z.number().int().positive(), isFavorite: z.boolean() })).mutation(({ ctx, input }) => updateInternalMailContact({ userId: ctx.user.id, ...input })),
    saveRule: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().max(160), subjectContains: z.string().trim().max(160).nullable().optional(), senderContains: z.string().trim().max(160).nullable().optional(), action: z.enum(["star", "archive", "category"]), category: z.string().trim().max(80).nullable().optional(), isEnabled: z.boolean().default(true) })).mutation(({ ctx, input }) => saveInternalMailRule({ userId: ctx.user.id, ...input })),
    deleteRule: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => deleteInternalMailRule({ userId: ctx.user.id, ...input })),
    saveTemplate: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().max(160), subject: z.string().max(255), body: z.string().max(50_000), bodyHtml: z.string().max(80_000).nullable().optional() })).mutation(({ ctx, input }) => saveInternalMailTemplate({ userId: ctx.user.id, ...input })),
    deleteTemplate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => deleteInternalMailTemplate({ userId: ctx.user.id, ...input })),
    saveDraft: protectedProcedure.input(z.object({
      messageId: z.number().int().positive().optional(),
      parentMessageId: z.number().int().positive().nullable().optional(),
      subject: z.string().max(255),
      body: z.string().max(50_000),
      bodyHtml: z.string().max(80_000).nullable().optional(),
      importance: z.enum(["normal", "high"]),
      toProfileIds: z.array(z.number().int().positive()).max(100).default([]),
      ccProfileIds: z.array(z.number().int().positive()).max(100).default([]),
      bccProfileIds: z.array(z.number().int().positive()).max(100).default([]),
      attachments: z.array(z.object({ originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(120), contentBase64: z.string().max(12_000_000) })).max(5).optional(),
    })).mutation(({ ctx, input }) => saveInternalMailDraft({ userId: ctx.user.id, messageId: input.messageId, parentMessageId: input.parentMessageId, subject: input.subject, body: input.body, bodyHtml: input.bodyHtml, importance: input.importance, recipients: { toProfileIds: input.toProfileIds, ccProfileIds: input.ccProfileIds, bccProfileIds: input.bccProfileIds }, attachments: input.attachments })),
    send: protectedProcedure.input(z.object({ messageId: z.number().int().positive() })).mutation(({ ctx, input }) => sendInternalMail({ userId: ctx.user.id, ...input })),
    schedule: protectedProcedure.input(z.object({ messageId: z.number().int().positive(), scheduledAt: z.date() })).mutation(async ({ ctx, input }) => {
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      if (!sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "تعذر تهيئة الإرسال المجدول لعدم توفر جلسة المستخدم." });
      await ensureInternalMailDispatchHeartbeatJob({ userSession: sessionToken });
      return scheduleInternalMail({ userId: ctx.user.id, ...input });
    }),
    recurringSchedules: protectedProcedure.query(({ ctx }) => listInternalMailRecurringSchedules({ userId: ctx.user.id })),
    scheduleRecurring: protectedProcedure.input(z.object({
      messageId: z.number().int().positive(),
      frequency: z.enum(["daily", "weekly", "monthly"]),
      intervalCount: z.number().int().min(1).max(365).default(1),
      weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      monthDay: z.number().int().min(1).max(31).nullable().optional(),
      startsAt: z.date(),
      endsAt: z.date().nullable().optional(),
    }).superRefine((input, ctx) => {
      if (input.frequency === "weekly" && !input.weekdays?.length) ctx.addIssue({ code: "custom", message: "اختر يوماً واحداً على الأقل للتكرار الأسبوعي.", path: ["weekdays"] });
      if (input.endsAt && input.endsAt <= input.startsAt) ctx.addIssue({ code: "custom", message: "يجب أن يكون تاريخ الانتهاء بعد وقت البداية.", path: ["endsAt"] });
    })).mutation(async ({ ctx, input }) => {
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      if (!sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "تعذر تهيئة الإرسال المتكرر لعدم توفر جلسة المستخدم." });
      await ensureInternalMailDispatchHeartbeatJob({ userSession: sessionToken });
      return scheduleRecurringInternalMail({ userId: ctx.user.id, messageId: input.messageId, rule: input });
    }),
    updateRecurringSchedule: protectedProcedure.input(z.object({ scheduleId: z.number().int().positive(), action: z.enum(["pause", "resume", "cancel"]) })).mutation(({ ctx, input }) => updateInternalMailRecurringSchedule({ userId: ctx.user.id, ...input })),
    updateEntry: protectedProcedure.input(z.object({ messageId: z.number().int().positive(), action: z.enum(["star", "unstar", "archive", "restore", "trash", "category"]), category: z.string().trim().max(80).nullable().optional() })).mutation(({ ctx, input }) => updateInternalMailEntry({ userId: ctx.user.id, ...input })),
  }),
  imports: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await requirePermission(ctx.user, "view");
      if (await hasLeadershipPlatformScope(ctx.user, permission)) return listImportBatches();
      if (permission === "employee") return listImportBatchesForUser(ctx.user.id);
      throw new TRPCError({ code: "FORBIDDEN", message: "لا تتوفر قائمة المرفقات في مساحة الملازم القضائي." });
    }),
    analyze: protectedProcedure.input(z.object({ filename: z.string().trim().min(1).max(255).refine(name => name.toLowerCase().endsWith(".xlsx"), "يدعم التحليل الذكي حالياً ملفات XLSX فقط."), contentBase64: z.string().min(20).max(12_000_000) })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "edit");
      if (permission !== "full_control" && permission !== "employee") throw new TRPCError({ code: "FORBIDDEN", message: "تحليل المرفقات متاح لصلاحية الموظف الإداري أو التحكم الكامل." });
      const content = Buffer.from(input.contentBase64, "base64");
      const analysis = analyzeExcelImport(content);
      if (analysis.status === "rejected") throw new TRPCError({ code: "BAD_REQUEST", message: analysis.warnings[0] || "تم رفض الملف لعدم صلاحية بياناته." });
      return { analysis, suggestion: suggestImportAction(analysis) };
    }),
    confirm: protectedProcedure.input(z.object({ filename: z.string().trim().min(1).max(255).refine(name => name.toLowerCase().endsWith(".xlsx"), "يدعم التحليل الذكي حالياً ملفات XLSX فقط."), contentBase64: z.string().min(20).max(12_000_000), action: z.enum(["schedule", "manual_review"]) })).mutation(async ({ ctx, input }) => {
      const permission = await requirePermission(ctx.user, "edit");
      if (permission !== "full_control" && permission !== "employee") throw new TRPCError({ code: "FORBIDDEN", message: "حفظ المرفقات متاح لصلاحية الموظف الإداري أو التحكم الكامل." });
      const content = Buffer.from(input.contentBase64, "base64");
      const analysis = analyzeExcelImport(content);
      if (analysis.status === "rejected") throw new TRPCError({ code: "BAD_REQUEST", message: analysis.warnings[0] || "تم رفض الملف لعدم صلاحية بياناته." });
      const canSchedule = input.action === "schedule" && (analysis.template === "delay_register" || analysis.template === "weekly_follow_up");
      return saveImportBatch({ filename: input.filename, content, analysis, createdByUserId: ctx.user.id, createTasks: canSchedule });
    }),
    linkAsTraineeSource: protectedProcedure.input(z.object({ importBatchId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requirePlatformOwner(ctx.user);
      await linkImportBatchAsTraineeSource(input.importBatchId, ctx.user.id);
      return { success: true };
    }),
  }),

  workPreferences: router({
    mine: protectedProcedure.query(({ ctx }) => getWorkPreferences(ctx.user.id)),
    update: protectedProcedure.input(z.object({ workMode: z.enum(["employee", "manager"]).optional(), notificationsEnabled: z.boolean().optional(), dndUntil: z.date().nullable().optional(), seenHelpKeys: z.array(z.string().trim().min(1).max(80)).max(80).optional() })).mutation(({ ctx, input }) => updateWorkPreferences({ userId: ctx.user.id, ...input })),
  }),

  delegation: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const permission = await permissionForUser(ctx.user);
      const roles = await rolesForUser(ctx.user);
      if (permission !== "full_control" && !roles.includes("court_president")) throw new TRPCError({ code: "FORBIDDEN", message: "التفويض المؤقت متاح لرئيس المحكمة والمالك فقط." });
      return listPermissionDelegations(ctx.user.id, permission === "full_control");
    }),
    create: protectedProcedure.input(z.object({ delegateUserId: z.number().int().positive(), role: z.enum(["assistant_president", "court_secretary", "human_resources_manager", "department_manager", "performance_monitor", "trainee_affairs_manager"]), unitId: z.number().int().positive().optional(), title: z.string().trim().min(5).max(240), startsAt: z.date(), endsAt: z.date(), notes: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      const permission = await permissionForUser(ctx.user);
      const roles = await rolesForUser(ctx.user);
      if (permission !== "full_control" && !roles.includes("court_president")) throw new TRPCError({ code: "FORBIDDEN", message: "إنشاء التفويض متاح لرئيس المحكمة والمالك فقط." });
      return createPermissionDelegation({ ...input, grantorUserId: ctx.user.id });
    }),
    cancel: protectedProcedure.input(z.object({ delegationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const permission = await permissionForUser(ctx.user);
      const roles = await rolesForUser(ctx.user);
      if (permission !== "full_control" && !roles.includes("court_president")) throw new TRPCError({ code: "FORBIDDEN", message: "إلغاء التفويض متاح لرئيس المحكمة والمالك فقط." });
      return cancelPermissionDelegation({ ...input, actorUserId: ctx.user.id });
    }),
    users: protectedProcedure.query(async ({ ctx }) => {
      const permission = await permissionForUser(ctx.user);
      const roles = await rolesForUser(ctx.user);
      if (permission !== "full_control" && !roles.includes("court_president")) throw new TRPCError({ code: "FORBIDDEN", message: "قائمة المفوض إليهم متاحة لرئيس المحكمة والمالك فقط." });
      return listPlatformUsersForRoleAssignment();
    }),
  }),

  search: router({
    global: protectedProcedure.input(z.object({ query: z.string().trim().min(2).max(120) })).query(async ({ ctx, input }) => {
      await requirePermission(ctx.user, "view");
      return globalSearch({ query: input.query, userId: ctx.user.id });
    }),
  }),

  ownerKpis: protectedProcedure.query(async ({ ctx }) => {
    const permission = await permissionForUser(ctx.user);
    const roles = await rolesForUser(ctx.user);
    if (permission !== "full_control" && !roles.includes("court_president")) throw new TRPCError({ code: "FORBIDDEN", message: "مؤشرات القيادة العليا متاحة للمالك ورئيس المحكمة فقط." });
    return getOwnerLeadershipKpis();
  }),

  attendanceSummary: protectedProcedure.input(z.object({ period: z.enum(["daily", "weekly", "monthly"]).default("daily") }).optional()).query(async ({ ctx, input }) => {
    const permission = await requirePermission(ctx.user, "view");
    const period = input?.period ?? "daily";
    const records = await hasLeadershipPlatformScope(ctx.user, permission) ? await listAttendance() : await listAttendanceForProfile((await requireSelfAttendanceProfile(ctx.user)).profile.id);
    return summarizeAttendanceRecords(records.map(item => ({ status: item.attendance.status, recordDate: item.attendance.recordDate })), period);
  }),
});
