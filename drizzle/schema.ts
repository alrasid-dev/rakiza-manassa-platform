import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the identity flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  firebaseUid: varchar("firebaseUid", { length: 128 }),
  firebaseLinkedAt: timestamp("firebaseLinkedAt"),
  passcodeHash: varchar("passcodeHash", { length: 255 }),
  activeDepartmentAccountId: int("activeDepartmentAccountId"),
  backupEmail: varchar("backupEmail", { length: 320 }),
  backupEmailVerifiedAt: timestamp("backupEmailVerifiedAt"),
  emailNotificationPreference: mysqlEnum("emailNotificationPreference", ["work", "backup", "both"]).default("work").notNull(),
  dashboardPreferences: text("dashboardPreferences"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  mustChangePassword: boolean("mustChangePassword").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  phone: varchar("phone", { length: 40 }),
}, table => [uniqueIndex("users_firebase_uid_unique").on(table.firebaseUid), index("users_active_department_account_idx").on(table.activeDepartmentAccountId), index("users_phone_idx").on(table.phone)]);

export const authActivationTokens = mysqlTable("auth_activation_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenDigest: varchar("tokenDigest", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("auth_activation_tokens_digest_unique").on(table.tokenDigest), index("auth_activation_tokens_user_idx").on(table.userId), index("auth_activation_tokens_expiry_idx").on(table.expiresAt)]);

export const otpChallenges = mysqlTable("otp_challenges", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  codeDigest: varchar("codeDigest", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  attempts: int("attempts").default(0).notNull(),
  maxAttempts: int("maxAttempts").default(5).notNull(),
  consumedAt: timestamp("consumedAt"),
  requestIpDigest: varchar("requestIpDigest", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("otp_challenges_email_idx").on(table.email), index("otp_challenges_expiry_idx").on(table.expiresAt)]);

export const webauthnCredentials = mysqlTable("webauthn_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  credentialId: varchar("credentialId", { length: 512 }).notNull(),
  publicKey: text("publicKey").notNull(),
  counter: int("counter").default(0).notNull(),
  transports: text("transports"),
  deviceType: varchar("deviceType", { length: 80 }),
  backedUp: boolean("backedUp").default(false).notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("webauthn_credentials_credential_unique").on(table.credentialId),
  index("webauthn_credentials_user_idx").on(table.userId),
]);

export const webauthnChallenges = mysqlTable("webauthn_challenges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  email: varchar("email", { length: 320 }).notNull(),
  challenge: varchar("challenge", { length: 256 }).notNull(),
  flow: mysqlEnum("flow", ["registration", "authentication"]).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("webauthn_challenges_email_flow_idx").on(table.email, table.flow),
  index("webauthn_challenges_expiry_idx").on(table.expiresAt),
]);

export const platformModules = mysqlTable("platform_modules", {
  id: int("id").autoincrement().primaryKey(),
  moduleKey: varchar("moduleKey", { length: 80 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  path: varchar("path", { length: 240 }).notNull(),
  iconKey: varchar("iconKey", { length: 80 }).notNull().default("LayoutDashboard"),
  moduleType: mysqlEnum("moduleType", ["navigation", "software"]).default("navigation").notNull(),
  audience: text("audience").notNull(),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("platform_modules_key_unique").on(table.moduleKey), index("platform_modules_enabled_order_idx").on(table.isEnabled, table.sortOrder)]);

export const organizationUnits = mysqlTable("organization_units", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 60 }).notNull(),
  parentId: int("parentId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("organization_units_code_unique").on(table.code)]);

export const workShifts = mysqlTable("work_shifts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 60 }).notNull(),
  startMinutes: int("startMinutes").notNull(),
  endMinutes: int("endMinutes").notNull(),
  fingerprintOpenMinutes: int("fingerprintOpenMinutes").notNull(),
  lateStartMinutes: int("lateStartMinutes").notNull(),
  morningCompensationDeadlineMinutes: int("morningCompensationDeadlineMinutes").notNull(),
  actualEndMinutes: int("actualEndMinutes").notNull(),
  eveningCompensationDeadlineMinutes: int("eveningCompensationDeadlineMinutes").notNull(),
  fingerprintCloseMinutes: int("fingerprintCloseMinutes").notNull(),
  workingDays: varchar("workingDays", { length: 40 }).default("0,1,2,3,4").notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("work_shifts_code_unique").on(table.code), index("work_shifts_active_idx").on(table.isActive)]);

export const personProfiles = mysqlTable("person_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  unitId: int("unitId"),
  shiftId: int("shiftId"),
  directManagerProfileId: int("directManagerProfileId"),
  personType: mysqlEnum("personType", ["administrative", "trainee", "judge"]).notNull(),
  fullName: varchar("fullName", { length: 240 }).notNull(),
  email: varchar("email", { length: 320 }),
  nationalId: varchar("nationalId", { length: 32 }),
  phone: varchar("phone", { length: 40 }),
  employeeNumber: varchar("employeeNumber", { length: 80 }),
  jobTitle: varchar("jobTitle", { length: 180 }),
  judicialFormation: varchar("judicialFormation", { length: 180 }),
  attendanceMode: mysqlEnum("attendanceMode", ["in_person", "remote", "mixed"]),
  activityState: mysqlEnum("activityState", ["active", "chatting", "inactive"]).default("inactive").notNull(),
  lastActiveAt: timestamp("lastActiveAt"),
  status: mysqlEnum("status", ["active", "on_leave", "inactive", "pending_review"]).default("pending_review").notNull(),
  employmentStatus: varchar("employmentStatus", { length: 180 }),
  assignmentNote: text("assignmentNote"),
  sourceReference: varchar("sourceReference", { length: 240 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("person_profiles_unit_idx").on(table.unitId),
  index("person_profiles_manager_idx").on(table.directManagerProfileId),
  index("person_profiles_type_idx").on(table.personType),
  index("person_profiles_user_idx").on(table.userId),
]);

export const profileDelegations = mysqlTable("profile_delegations", {
  id: int("id").autoincrement().primaryKey(),
  delegateProfileId: int("delegateProfileId").notNull(),
  coveredProfileId: int("coveredProfileId"),
  unitId: int("unitId"),
  assignmentType: mysqlEnum("assignmentType", ["acting", "temporary_duty", "formation_assignment"]).default("acting").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  sourceReference: varchar("sourceReference", { length: 240 }),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt"),
  status: mysqlEnum("status", ["planned", "active", "ended", "cancelled"]).default("active").notNull(),
  notes: text("notes"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("profile_delegations_delegate_idx").on(table.delegateProfileId),
  index("profile_delegations_covered_idx").on(table.coveredProfileId),
  index("profile_delegations_unit_idx").on(table.unitId),
  index("profile_delegations_status_idx").on(table.status),
  index("profile_delegations_dates_idx").on(table.startsAt, table.endsAt),
]);

export const traineeAssignments = mysqlTable("trainee_assignments", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  trainingJudge: varchar("trainingJudge", { length: 240 }),
  supervisingJudgeProfileId: int("supervisingJudgeProfileId"),
  courtTrack: varchar("courtTrack", { length: 160 }),
  sourceStartDate: varchar("sourceStartDate", { length: 80 }),
  expectedStartAt: timestamp("expectedStartAt"),
  expectedEndAt: timestamp("expectedEndAt"),
  durationDays: int("durationDays").default(60).notNull(),
  renewalCount: int("renewalCount").default(0).notNull(),
  status: mysqlEnum("status", ["active", "on_leave", "completed", "needs_date_confirmation"]).default("needs_date_confirmation").notNull(),
  sourceNote: text("sourceNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("trainee_assignments_profile_unique").on(table.profileId),
  index("trainee_assignments_expected_end_idx").on(table.expectedEndAt),
  index("trainee_assignments_status_idx").on(table.status),
  index("trainee_assignments_supervising_judge_idx").on(table.supervisingJudgeProfileId),
]);

export const documentRecords = mysqlTable("document_records", {
  id: int("id").autoincrement().primaryKey(),
  documentType: mysqlEnum("documentType", ["letter", "daily_attendance", "form", "task_schedule", "report", "other"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  storageUrl: varchar("storageUrl", { length: 600 }),
  originalName: varchar("originalName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 120 }),
  sourceReference: varchar("sourceReference", { length: 240 }),
  summary: text("summary"),
  profileId: int("profileId"),
  unitId: int("unitId"),
  linkedTaskId: int("linkedTaskId"),
  reportPeriod: varchar("reportPeriod", { length: 20 }).default("monthly").notNull(),
  reviewStatus: mysqlEnum("reviewStatus", ["submitted", "accepted", "rejected"]).notNull().default("submitted"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("document_records_type_created_idx").on(table.documentType, table.createdAt), index("document_records_unit_created_idx").on(table.unitId, table.createdAt), index("document_records_profile_created_idx").on(table.profileId, table.createdAt)]);

/** نتيجة تحليل تقرير الأداء وقرار المراجعة؛ لا تحتوي مطلقاً على بايتات المرفق. */
export const performanceReportEvaluations = mysqlTable("performance_report_evaluations", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  analysisStatus: mysqlEnum("analysisStatus", ["readable", "partial", "unreadable", "not_attempted"]).notNull().default("not_attempted"),
  analysisSummary: text("analysisSummary"),
  findingsJson: text("findingsJson"),
  extractedCompletedCount: int("extractedCompletedCount"),
  extractedIssueCount: int("extractedIssueCount"),
  periodDays: int("periodDays").notNull(),
  normalizedDailyRateHundredths: int("normalizedDailyRateHundredths"),
  confidence: int("confidence"),
  suggestedPoints: int("suggestedPoints"),
  managerDecision: mysqlEnum("managerDecision", ["pending", "accepted", "returned", "rejected"]).notNull().default("pending"),
  managerPoints: int("managerPoints"),
  managerNote: text("managerNote"),
  analyzedAt: timestamp("analyzedAt"),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("performance_report_evaluations_document_unique").on(table.documentId), index("performance_report_evaluations_decision_idx").on(table.managerDecision, table.createdAt)]);

export const dataSourceConfigs = mysqlTable("data_source_configs", {
  id: int("id").autoincrement().primaryKey(),
  sourceType: mysqlEnum("sourceType", ["trainee_excel"]).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 600 }).notNull(),
  lastFingerprint: varchar("lastFingerprint", { length: 128 }),
  lastScannedAt: timestamp("lastScannedAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("data_source_configs_type_unique").on(table.sourceType)]);

export const administrativeLevels = mysqlTable("administrative_levels", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  managerProfileId: int("managerProfileId").notNull(),
  sequenceOrder: int("sequenceOrder").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("administrative_levels_sequence_unique").on(table.sequenceOrder),
  index("administrative_levels_manager_idx").on(table.managerProfileId),
]);

export const correspondences = mysqlTable("correspondences", {
  id: int("id").autoincrement().primaryKey(),
  correspondenceType: mysqlEnum("correspondenceType", ["request", "letter"]).notNull(),
  senderProfileId: int("senderProfileId").notNull(),
  recipientProfileId: int("recipientProfileId"),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  currentLevelId: int("currentLevelId"),
  linkedTaskId: int("linkedTaskId"),
  status: mysqlEnum("status", ["pending", "in_review", "approved", "returned", "rejected", "closed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("correspondences_sender_status_idx").on(table.senderProfileId, table.status),
  index("correspondences_level_status_idx").on(table.currentLevelId, table.status),
]);

export const correspondenceActions = mysqlTable("correspondence_actions", {
  id: int("id").autoincrement().primaryKey(),
  correspondenceId: int("correspondenceId").notNull(),
  fromLevelId: int("fromLevelId"),
  toLevelId: int("toLevelId"),
  actorUserId: int("actorUserId").notNull(),
  action: mysqlEnum("action", ["created", "forwarded", "approved", "returned", "rejected", "commented"]).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("correspondence_actions_correspondence_created_idx").on(table.correspondenceId, table.createdAt)]);

export const correspondenceRecipients = mysqlTable("correspondence_recipients", {
  id: int("id").autoincrement().primaryKey(),
  correspondenceId: int("correspondenceId").notNull(),
  profileId: int("profileId").notNull(),
  recipientType: mysqlEnum("recipientType", ["trainee_copy", "manager_copy", "direct_recipient", "president_mandatory_copy"]).notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("correspondence_recipients_unique").on(table.correspondenceId, table.profileId, table.recipientType),
  index("correspondence_recipients_profile_idx").on(table.profileId, table.isRead),
]);

/** مرفقات الطلبات والمراسلات؛ تحفظ البايتات في التخزين المعتمد فقط. */
export const correspondenceAttachments = mysqlTable("correspondence_attachments", {
  id: int("id").autoincrement().primaryKey(),
  correspondenceId: int("correspondenceId").notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1000 }).notNull(),
  uploadedByProfileId: int("uploadedByProfileId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("correspondence_attachments_correspondence_created_idx").on(table.correspondenceId, table.createdAt)]);

export const internalMailMessages = mysqlTable("internal_mail_messages", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId"),
  parentMessageId: int("parentMessageId"),
  senderProfileId: int("senderProfileId").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  bodyHtml: text("bodyHtml"),
  automationAction: mysqlEnum("automationAction", ["none", "draft", "reply", "forward"]).default("none").notNull(),
  importance: mysqlEnum("importance", ["normal", "high"]).default("normal").notNull(),
  status: mysqlEnum("status", ["draft", "scheduled", "sent"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  recurringScheduleRunId: int("recurringScheduleRunId"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("internal_mail_messages_sender_status_idx").on(table.senderProfileId, table.status, table.updatedAt),
  index("internal_mail_messages_thread_idx").on(table.threadId, table.sentAt),
  index("internal_mail_messages_scheduled_idx").on(table.status, table.scheduledAt),
  uniqueIndex("internal_mail_messages_recurring_run_unique").on(table.recurringScheduleRunId),
]);

export const internalMailEntries = mysqlTable("internal_mail_entries", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  profileId: int("profileId").notNull(),
  recipientType: mysqlEnum("recipientType", ["sender", "to", "cc", "bcc"]).notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  readAt: timestamp("readAt"),
  isStarred: boolean("isStarred").default(false).notNull(),
  category: varchar("category", { length: 80 }),
  archivedAt: timestamp("archivedAt"),
  trashedAt: timestamp("trashedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("internal_mail_entries_message_profile_type_unique").on(table.messageId, table.profileId, table.recipientType),
  index("internal_mail_entries_profile_box_idx").on(table.profileId, table.trashedAt, table.archivedAt, table.isRead),
  index("internal_mail_entries_message_idx").on(table.messageId),
]);

export const internalMailAttachments = mysqlTable("internal_mail_attachments", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 600 }).notNull(),
  uploadedByProfileId: int("uploadedByProfileId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("internal_mail_attachments_message_idx").on(table.messageId)]);

export const internalMailPreferences = mysqlTable("internal_mail_preferences", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  signature: text("signature"),
  signatureImageStorageKey: varchar("signatureImageStorageKey", { length: 512 }),
  signatureImageStorageUrl: varchar("signatureImageStorageUrl", { length: 600 }),
  assistantMode: mysqlEnum("assistantMode", ["off", "draft", "auto_reply", "auto_forward"]).default("off").notNull(),
  assistantReplyTone: mysqlEnum("assistantReplyTone", ["formal", "concise"]).default("formal").notNull(),
  assistantForwardProfileId: int("assistantForwardProfileId"),
  assistantSubjectContains: varchar("assistantSubjectContains", { length: 160 }),
  assistantEnabledAt: timestamp("assistantEnabledAt"),
  assistantUpdatedByUserId: int("assistantUpdatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("internal_mail_preferences_profile_unique").on(table.profileId)]);

/** قائمة العمل المتينة للمسودات والردود والتحويلات التي يفوضها صاحب بريد ركيزة. لا تخزن نصوص النموذج. */
export const internalMailAssistantActions = mysqlTable("internal_mail_assistant_actions", {
  id: int("id").autoincrement().primaryKey(),
  sourceMessageId: int("sourceMessageId").notNull(),
  profileId: int("profileId").notNull(),
  mode: mysqlEnum("mode", ["draft", "reply", "forward"]).notNull(),
  forwardProfileId: int("forwardProfileId"),
  status: mysqlEnum("status", ["pending", "processed", "skipped", "failed"]).default("pending").notNull(),
  generatedMessageId: int("generatedMessageId"),
  errorCode: varchar("errorCode", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
}, table => [
  uniqueIndex("internal_mail_ai_action_source_profile_unique").on(table.sourceMessageId, table.profileId),
  index("internal_mail_ai_action_status_created_idx").on(table.status, table.createdAt),
  index("internal_mail_ai_action_profile_idx").on(table.profileId, table.createdAt),
]);

export const internalMailContacts = mysqlTable("internal_mail_contacts", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  contactProfileId: int("contactProfileId").notNull(),
  isFavorite: boolean("isFavorite").default(true).notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("internal_mail_contacts_profile_contact_unique").on(table.profileId, table.contactProfileId), index("internal_mail_contacts_profile_favorite_idx").on(table.profileId, table.isFavorite)]);

export const internalMailRules = mysqlTable("internal_mail_rules", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  subjectContains: varchar("subjectContains", { length: 160 }),
  senderContains: varchar("senderContains", { length: 160 }),
  action: mysqlEnum("action", ["star", "archive", "category"]).notNull(),
  category: varchar("category", { length: 80 }),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("internal_mail_rules_profile_enabled_idx").on(table.profileId, table.isEnabled)]);

export const internalMailTemplates = mysqlTable("internal_mail_templates", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  bodyHtml: text("bodyHtml"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("internal_mail_templates_profile_updated_idx").on(table.profileId, table.updatedAt)]);

export const internalMailScheduleJobs = mysqlTable("internal_mail_schedule_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobKey: varchar("jobKey", { length: 80 }).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("internal_mail_schedule_jobs_key_unique").on(table.jobKey), index("internal_mail_schedule_jobs_task_uid_idx").on(table.scheduleCronTaskUid)]);

/** قاعدة تكرار داخلية للمسودة المصدر؛ لا تحفظ عناوين بريد خارج ركيزة ولا بيانات مرفقات. */
export const internalMailRecurringSchedules = mysqlTable("internal_mail_recurring_schedules", {
  id: int("id").autoincrement().primaryKey(),
  sourceMessageId: int("sourceMessageId").notNull(),
  senderProfileId: int("senderProfileId").notNull(),
  frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly"]).notNull(),
  intervalCount: int("intervalCount").default(1).notNull(),
  weekdays: varchar("weekdays", { length: 20 }),
  monthDay: int("monthDay"),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt"),
  nextRunAt: timestamp("nextRunAt").notNull(),
  lastRunAt: timestamp("lastRunAt"),
  status: mysqlEnum("status", ["active", "paused", "cancelled"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("internal_mail_recurring_source_unique").on(table.sourceMessageId),
  index("internal_mail_recurring_due_idx").on(table.status, table.nextRunAt),
  index("internal_mail_recurring_sender_idx").on(table.senderProfileId, table.updatedAt),
]);

/** سجل تسليم لكل موعد، يضمن أن إعادة تشغيل المهمة الدورية لا تنشئ نسخة بريد مكررة. */
export const internalMailRecurringScheduleRuns = mysqlTable("internal_mail_recurring_schedule_runs", {
  id: int("id").autoincrement().primaryKey(),
  scheduleId: int("scheduleId").notNull(),
  scheduledFor: timestamp("scheduledFor").notNull(),
  sentMessageId: int("sentMessageId"),
  status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
  failureReason: varchar("failureReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("internal_mail_recurring_runs_schedule_due_unique").on(table.scheduleId, table.scheduledFor),
  uniqueIndex("internal_mail_recurring_runs_message_unique").on(table.sentMessageId),
  index("internal_mail_recurring_runs_status_idx").on(table.status, table.createdAt),
]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId"),
  category: mysqlEnum("category", ["trainee_due_soon", "task_due", "delay_alert", "access_request", "support_ticket", "attendance_confirmation", "security_alert", "performance_recommendation", "chat_message", "report_review", "correspondence_update"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  dedupeKey: varchar("dedupeKey", { length: 255 }),
  isRead: boolean("isRead").default(false).notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
}, table => [
  index("notifications_profile_read_idx").on(table.profileId, table.isRead),
  index("notifications_category_sent_idx").on(table.category, table.sentAt),
  uniqueIndex("notifications_dedupe_key_unique").on(table.dedupeKey),
]);

export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  endpoint: varchar("endpoint", { length: 512 }).notNull(),
  p256dh: varchar("p256dh", { length: 512 }).notNull(),
  auth: varchar("auth", { length: 512 }).notNull(),
  userAgent: varchar("userAgent", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
  index("push_subscriptions_profile_idx").on(table.profileId),
]);

export const fcmTokens = mysqlTable("fcm_tokens", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  token: varchar("token", { length: 512 }).notNull(),
  platform: varchar("platform", { length: 32 }).default("web").notNull(),
  userAgent: varchar("userAgent", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("fcm_tokens_token_unique").on(table.token),
  index("fcm_tokens_profile_idx").on(table.profileId),
]);

export const taskComments = mysqlTable("task_comments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  profileId: int("profileId"),
  authorUserId: int("authorUserId"),
  comment: text("comment").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("task_comments_task_created_idx").on(table.taskId, table.createdAt)]);

export const excelChangeEvents = mysqlTable("excel_change_events", {
  id: int("id").autoincrement().primaryKey(),
  importBatchId: int("importBatchId").notNull(),
  sourceKey: varchar("sourceKey", { length: 255 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
  changeType: mysqlEnum("changeType", ["added", "modified"]).notNull(),
  title: text("title").notNull(),
  relatedProfileId: int("relatedProfileId"),
  linkedTaskId: int("linkedTaskId"),
  rawSummary: text("rawSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("excel_change_events_source_fingerprint_unique").on(table.sourceKey, table.fingerprint),
  index("excel_change_events_profile_idx").on(table.relatedProfileId),
]);

export const attendanceRecords = mysqlTable("attendance_records", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  recordDate: timestamp("recordDate").notNull(),
  checkInAt: timestamp("checkInAt"),
  checkOutAt: timestamp("checkOutAt"),
  status: mysqlEnum("status", ["present", "late", "absent", "excused", "on_leave"]).notNull(),
  note: text("note"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("attendance_profile_date_unique").on(table.profileId, table.recordDate),
  index("attendance_date_status_idx").on(table.recordDate, table.status),
]);

export const leaveRequests = mysqlTable("leave_requests", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  requestType: mysqlEnum("requestType", ["leave", "permission"]).notNull(),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  durationMinutes: int("durationMinutes").notNull(),
  substituteProfileId: int("substituteProfileId"),
  handoverConfirmed: boolean("handoverConfirmed").default(false).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "active", "completed"]).default("pending").notNull(),
  note: text("note"),
  requestedByUserId: int("requestedByUserId").notNull(),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("leave_requests_profile_status_idx").on(table.profileId, table.status),
  index("leave_requests_period_idx").on(table.startAt, table.endAt),
]);

export const scheduledJobConfigs = mysqlTable("scheduled_job_configs", {
  id: int("id").autoincrement().primaryKey(),
  jobType: mysqlEnum("jobType", ["trainee_due_soon", "daily_task_reminder", "task_escalation", "leave_status_refresh", "trainee_excel_sync", "support_ticket_escalation", "attendance_confirmation"]).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  attendanceTargetProfileId: int("attendanceTargetProfileId"),
  attendanceTargetAudience: varchar("attendanceTargetAudience", { length: 40 }).default("all").notNull(),
  attendanceShiftEnabled: boolean("attendanceShiftEnabled").default(false).notNull(),
  cronExpression: varchar("cronExpression", { length: 100 }).notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("scheduled_job_configs_type_unique").on(table.jobType),
  index("scheduled_job_configs_task_uid_idx").on(table.scheduleCronTaskUid),
  index("scheduled_job_configs_attendance_target_idx").on(table.attendanceTargetProfileId),
]);

export const courtRoleAssignments = mysqlTable("court_role_assignments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["court_president", "assistant_president", "court_secretary", "human_resources_manager", "department_manager", "performance_monitor", "trainee_affairs_manager", "technical_support_manager", "technical_support_agent", "administrative_staff", "judicial_trainee", "judge"]).notNull(),
  unitId: int("unitId"),
  delegatedByUserId: int("delegatedByUserId"),
  startsAt: timestamp("startsAt").defaultNow().notNull(),
  endsAt: timestamp("endsAt"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("court_roles_user_active_idx").on(table.userId, table.isActive),
  index("court_roles_unit_idx").on(table.unitId),
]);

export const taskTemplates = mysqlTable("task_templates", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId"),
  title: text("title").notNull(),
  frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly", "quarterly", "custom"]).notNull(),
  workdayOnly: boolean("workdayOnly").default(true).notNull(),
  dueHourLocal: int("dueHourLocal").default(13).notNull(),
  requiredApprovals: int("requiredApprovals").default(1).notNull(),
  defaultAssigneeProfileId: int("defaultAssigneeProfileId"),
  formReference: varchar("formReference", { length: 240 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("task_templates_unit_active_idx").on(table.unitId, table.isActive)]);

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId"),
  unitId: int("unitId"),
  title: text("title").notNull(),
  status: mysqlEnum("status", ["new", "in_progress", "under_review", "completed", "overdue", "cancelled"]).default("new").notNull(),
  priority: mysqlEnum("priority", ["normal", "high", "critical"]).default("normal").notNull(),
  assigneeProfileId: int("assigneeProfileId"),
  assignedByUserId: int("assignedByUserId").notNull(),
  scheduledFor: timestamp("scheduledFor").notNull(),
  startedAt: timestamp("startedAt"),
  dueAt: timestamp("dueAt").notNull(),
  completedAt: timestamp("completedAt"),
  completionNote: text("completionNote"),
  hasObstacle: boolean("hasObstacle").default(false).notNull(),
  obstacleDetail: text("obstacleDetail"),
  archivedAt: timestamp("archivedAt"),
  archivedByUserId: int("archivedByUserId"),
  recurrence: mysqlEnum("recurrence", ["none", "daily", "weekly", "monthly", "custom"]).default("none").notNull(),
  recurrenceEndAt: timestamp("recurrenceEndAt"),
  watcherProfileId: int("watcherProfileId"),
  isConfidential: boolean("isConfidential").default(false).notNull(),
  confidentialityExpiresAt: timestamp("confidentialityExpiresAt"),
  taskType: mysqlEnum("taskType", ["permanent", "urgent"]).default("permanent").notNull(),
  isPinned: boolean("isPinned").default(false).notNull(),
  taskNotes: text("taskNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("tasks_assignee_status_idx").on(table.assigneeProfileId, table.status),
  index("tasks_due_idx").on(table.dueAt),
  index("tasks_unit_idx").on(table.unitId),
  index("tasks_archived_idx").on(table.archivedAt),
  index("tasks_watcher_idx").on(table.watcherProfileId),
  index("tasks_confidential_idx").on(table.isConfidential, table.confidentialityExpiresAt),
]);

export const taskUpdates = mysqlTable("task_updates", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  actorUserId: int("actorUserId").notNull(),
  updateType: mysqlEnum("updateType", ["acknowledged", "progress", "submitted", "returned", "approved", "overdue_marked", "reassignment_requested", "obstacle_reported", "exception_decided"]).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("task_updates_task_created_idx").on(table.taskId, table.createdAt)]);

/** مرفقات التعليقات وتحديثات العمل؛ تحفظ البايتات في التخزين المعتمد فقط. */
export const taskUpdateAttachments = mysqlTable("task_update_attachments", {
  id: int("id").autoincrement().primaryKey(),
  taskUpdateId: int("taskUpdateId").notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1000 }).notNull(),
  uploadedByProfileId: int("uploadedByProfileId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("task_update_attachments_update_idx").on(table.taskUpdateId, table.createdAt)]);

/** إشارات صريحة داخل تحديثات العمل؛ تقيد بملفات الموظفين التي يسمح بها مسار المهمة. */
export const taskUpdateMentions = mysqlTable("task_update_mentions", {
  id: int("id").autoincrement().primaryKey(),
  taskUpdateId: int("taskUpdateId").notNull(),
  mentionedProfileId: int("mentionedProfileId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("task_update_mentions_unique").on(table.taskUpdateId, table.mentionedProfileId),
  index("task_update_mentions_profile_idx").on(table.mentionedProfileId, table.createdAt),
]);

/** بيانات مرفقات المهمة؛ تحفظ البايتات في التخزين المعتمد فقط. */
export const taskAttachments = mysqlTable("task_attachments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1000 }).notNull(),
  uploadedByProfileId: int("uploadedByProfileId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("task_attachments_task_created_idx").on(table.taskId, table.createdAt)]);

/** مسار مستقل لطلبات إعادة الإسناد وبلاغات العوائق الخاضعة لقرار المدير المباشر. */
export const taskExceptionRequests = mysqlTable("task_exception_requests", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  kind: mysqlEnum("kind", ["reassignment", "obstacle"]).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  requesterProfileId: int("requesterProfileId").notNull(),
  managerProfileId: int("managerProfileId").notNull(),
  reason: text("reason").notNull(),
  proposedAssigneeProfileId: int("proposedAssigneeProfileId"),
  approvedAssigneeProfileId: int("approvedAssigneeProfileId"),
  deductionPoints: int("deductionPoints").default(0).notNull(),
  managerNote: text("managerNote"),
  decidedByUserId: int("decidedByUserId"),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("task_exception_requests_task_status_idx").on(table.taskId, table.status),
  index("task_exception_requests_manager_status_idx").on(table.managerProfileId, table.status),
  index("task_exception_requests_requester_status_idx").on(table.requesterProfileId, table.status),
]);

export const delayRecords = mysqlTable("delay_records", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId"),
  relatedProfileId: int("relatedProfileId"),
  taskId: int("taskId"),
  title: text("title").notNull(),
  category: varchar("category", { length: 160 }).notNull(),
  referenceNumber: varchar("referenceNumber", { length: 120 }),
  startedAt: timestamp("startedAt"),
  status: mysqlEnum("status", ["under_follow_up", "overdue", "resolved", "archived"]).default("under_follow_up").notNull(),
  ownerProfileId: int("ownerProfileId"),
  actionTaken: text("actionTaken"),
  nextFollowUpAt: timestamp("nextFollowUpAt"),
  sourceReference: varchar("sourceReference", { length: 240 }),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("delay_records_status_idx").on(table.status),
  index("delay_records_owner_idx").on(table.ownerProfileId),
]);

export const approvalRequests = mysqlTable("approval_requests", {
  id: int("id").autoincrement().primaryKey(),
  entityType: mysqlEnum("entityType", ["task", "delay", "decision", "disciplinary_action", "score_adjustment", "department_manager_assignment"]).notNull(),
  entityId: int("entityId").notNull(),
  requestedByUserId: int("requestedByUserId").notNull(),
  currentRole: mysqlEnum("currentRole", ["trainee_affairs_manager", "human_resources_manager", "court_secretary", "assistant_president", "court_president"]).notNull(),
  status: mysqlEnum("status", ["pending", "returned", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  requestNote: text("requestNote"),
  decisionNote: text("decisionNote"),
  decidedByUserId: int("decidedByUserId"),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("approval_requests_current_status_idx").on(table.currentRole, table.status)]);

export const scoreEvents = mysqlTable("score_events", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  taskId: int("taskId"),
  delayRecordId: int("delayRecordId"),
  points: int("points").notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("score_events_profile_created_idx").on(table.profileId, table.createdAt)]);

export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId"),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  visibility: mysqlEnum("visibility", ["all", "unit_only", "roles_only"]).default("all").notNull(),
  publishedAt: timestamp("publishedAt"),
  expiresAt: timestamp("expiresAt"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("announcements_published_idx").on(table.publishedAt)]);

export const importBatches = mysqlTable("import_batches", {
  id: int("id").autoincrement().primaryKey(),
  source: mysqlEnum("source", ["manual_upload", "teams_sync"]).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 600 }).notNull(),
  status: mysqlEnum("status", ["validated", "requires_review", "rejected", "imported"]).default("requires_review").notNull(),
  summary: text("summary"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
}, table => [
  index("import_batches_status_created_idx").on(table.status, table.createdAt),
  index("import_batches_source_idx").on(table.source),
]);

export const registrationRequests = mysqlTable("registration_requests", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("fullName", { length: 240 }).notNull(),
  officialEmail: varchar("officialEmail", { length: 320 }).notNull(),
  notificationEmail: varchar("notificationEmail", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedByUserId: int("reviewedByUserId"),
  reviewNote: text("reviewNote"),
  privacyNoticeVersion: varchar("privacyNoticeVersion", { length: 40 }).notNull().default("2026-08-v1"),
  privacyAcknowledgedAt: timestamp("privacyAcknowledgedAt").notNull(),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("registration_requests_email_unique").on(table.officialEmail),
  index("registration_requests_status_created_idx").on(table.status, table.createdAt),
]);

export const accessGrants = mysqlTable("access_grants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  registrationRequestId: int("registrationRequestId"),
  fullName: varchar("fullName", { length: 240 }).notNull(),
  officialEmail: varchar("officialEmail", { length: 320 }).notNull(),
  notificationEmail: varchar("notificationEmail", { length: 320 }).notNull(),
  permission: mysqlEnum("permission", ["full_control", "general_view", "employee", "trainee"]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  grantedByUserId: int("grantedByUserId").notNull(),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("access_grants_email_unique").on(table.officialEmail),
  index("access_grants_active_permission_idx").on(table.isActive, table.permission),
]);

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId"),
  actorProfileId: int("actorProfileId"),
  actingDepartmentAccountId: int("actingDepartmentAccountId"),
  departmentDelegationId: int("departmentDelegationId"),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entityType", { length: 100 }).notNull(),
  entityId: int("entityId"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
  index("audit_logs_department_account_created_idx").on(table.actingDepartmentAccountId, table.createdAt),
]);

export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(), requesterProfileId: int("requesterProfileId").notNull(), requesterUnitId: int("requesterUnitId"),
  title: varchar("title", { length: 255 }).notNull(), description: text("description").notNull(), priority: mysqlEnum("priority", ["normal", "high", "critical"]).default("normal").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed", "escalated_to_manager", "escalated_to_president"]).default("open").notNull(),
  assignedSupportProfileId: int("assignedSupportProfileId"), supportManagerProfileId: int("supportManagerProfileId"), linkedTaskId: int("linkedTaskId"),
  dueAt: timestamp("dueAt").notNull(), managerDueAt: timestamp("managerDueAt"), resolvedAt: timestamp("resolvedAt"), resolutionNote: text("resolutionNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("support_tickets_requester_status_idx").on(table.requesterProfileId, table.status), index("support_tickets_assignee_status_idx").on(table.assignedSupportProfileId, table.status), index("support_tickets_due_status_idx").on(table.dueAt, table.status)]);

export const supportTicketComments = mysqlTable("support_ticket_comments", {
  id: int("id").autoincrement().primaryKey(), ticketId: int("ticketId").notNull(), authorProfileId: int("authorProfileId").notNull(), authorUserId: int("authorUserId").notNull(),
  body: text("body").notNull(), isInternal: boolean("isInternal").default(false).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("support_ticket_comments_ticket_created_idx").on(table.ticketId, table.createdAt)]);

export const supportTicketAttachments = mysqlTable("support_ticket_attachments", {
  id: int("id").autoincrement().primaryKey(), ticketId: int("ticketId").notNull(), originalName: varchar("originalName", { length: 255 }).notNull(), mimeType: varchar("mimeType", { length: 120 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(), storageUrl: varchar("storageUrl", { length: 600 }).notNull(), uploadedByProfileId: int("uploadedByProfileId").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("support_ticket_attachments_ticket_idx").on(table.ticketId)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type PersonProfile = typeof personProfiles.$inferSelect;
export type CourtRole = typeof courtRoleAssignments.$inferSelect["role"];


export const decisionsCirculars = mysqlTable("decisions_circulars", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", ["decision", "circular"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  unitId: int("unitId"),
  status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
  publishedByUserId: int("publishedByUserId"),
  publishedAt: timestamp("publishedAt"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("decisions_circulars_status_published_idx").on(table.status, table.publishedAt), index("decisions_circulars_unit_idx").on(table.unitId)]);

export const decisionReads = mysqlTable("decision_reads", {
  id: int("id").autoincrement().primaryKey(),
  decisionId: int("decisionId").notNull(),
  userId: int("userId").notNull(),
  readAt: timestamp("readAt").defaultNow().notNull(),
}, table => [uniqueIndex("decision_reads_unique").on(table.decisionId, table.userId), index("decision_reads_user_idx").on(table.userId, table.readAt)]);


export const meetings = mysqlTable("meetings", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  agenda: text("agenda"),
  scheduledAt: timestamp("scheduledAt").notNull(),
  location: varchar("location", { length: 255 }),
  unitId: int("unitId"),
  status: mysqlEnum("status", ["scheduled", "held", "cancelled"]).default("scheduled").notNull(),
  minutes: text("minutes"),
  recommendations: text("recommendations"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("meetings_unit_scheduled_idx").on(table.unitId, table.scheduledAt), index("meetings_status_scheduled_idx").on(table.status, table.scheduledAt)]);

export const meetingAttendees = mysqlTable("meeting_attendees", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull(),
  profileId: int("profileId").notNull(),
  attendanceStatus: mysqlEnum("attendanceStatus", ["invited", "attended", "absent", "excused"]).default("invited").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("meeting_attendees_unique").on(table.meetingId, table.profileId), index("meeting_attendees_profile_idx").on(table.profileId, table.attendanceStatus)]);


/** Court assets and custody records. A profile cannot be transferred/closed while active custody remains. */
export const courtAssets = mysqlTable("court_assets", {
  id: int("id").autoincrement().primaryKey(),
  assetNumber: varchar("assetNumber", { length: 100 }).notNull(),
  assetType: mysqlEnum("assetType", ["computer", "phone", "screen", "printer", "seal", "other"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  serialNumber: varchar("serialNumber", { length: 160 }),
  unitId: int("unitId"),
  status: mysqlEnum("status", ["available", "assigned", "returned", "maintenance", "lost"]).default("available").notNull(),
  notes: text("notes"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("court_assets_number_unique").on(table.assetNumber),
  index("court_assets_status_idx").on(table.status),
  index("court_assets_unit_idx").on(table.unitId),
]);

export const assetCustodies = mysqlTable("asset_custodies", {
  id: int("id").autoincrement().primaryKey(),
  assetId: int("assetId").notNull(),
  profileId: int("profileId").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  returnedAt: timestamp("returnedAt"),
  status: mysqlEnum("status", ["assigned", "returned", "pending_clearance"]).default("assigned").notNull(),
  returnCondition: varchar("returnCondition", { length: 255 }),
  notes: text("notes"),
  assignedByUserId: int("assignedByUserId").notNull(),
  returnedByUserId: int("returnedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("asset_custodies_asset_status_idx").on(table.assetId, table.status),
  index("asset_custodies_profile_status_idx").on(table.profileId, table.status),
]);

export const assetCustodyAudit = mysqlTable("asset_custody_audit", {
  id: int("id").autoincrement().primaryKey(),
  assetId: int("assetId").notNull(),
  custodyId: int("custodyId"),
  action: mysqlEnum("action", ["created", "assigned", "returned", "marked_lost", "updated"]).notNull(),
  actorUserId: int("actorUserId").notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("asset_custody_audit_asset_created_idx").on(table.assetId, table.createdAt),
]);


export const correspondenceTemplates = mysqlTable("correspondence_templates", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  ownerProfileId: int("ownerProfileId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("correspondence_templates_owner_active_idx").on(table.ownerProfileId, table.isActive), index("correspondence_templates_unit_idx").on(table.unitId)]);

export const departmentAccounts = mysqlTable("department_accounts", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  accountKey: varchar("accountKey", { length: 120 }).notNull(),
  displayName: varchar("displayName", { length: 180 }).notNull(),
  loginEmail: varchar("loginEmail", { length: 320 }).notNull(),
  notificationEmail: varchar("notificationEmail", { length: 320 }).notNull(),
  userId: int("userId"),
  profileId: int("profileId"),
  isActive: boolean("isActive").default(false).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("department_accounts_key_unique").on(table.accountKey), uniqueIndex("department_accounts_login_email_unique").on(table.loginEmail), index("department_accounts_unit_active_idx").on(table.unitId, table.isActive), index("department_accounts_user_idx").on(table.userId)]);

export const departmentAccountDelegations = mysqlTable("department_account_delegations", {
  id: int("id").autoincrement().primaryKey(),
  departmentAccountId: int("departmentAccountId").notNull(),
  delegateUserId: int("delegateUserId").notNull(),
  delegateProfileId: int("delegateProfileId"),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt"),
  status: mysqlEnum("status", ["planned", "active", "ended", "cancelled"]).default("active").notNull(),
  notes: text("notes"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("department_account_delegations_account_status_idx").on(table.departmentAccountId, table.status),
  index("department_account_delegations_delegate_status_idx").on(table.delegateUserId, table.status),
  index("department_account_delegations_window_idx").on(table.startsAt, table.endsAt),
]);

export const internalConversations = mysqlTable("internal_conversations", {
  id: int("id").autoincrement().primaryKey(),
  subject: varchar("subject", { length: 255 }),
  conversationType: mysqlEnum("conversationType", ["direct", "department", "custom", "general", "task"]).default("direct").notNull(),
  unitId: int("unitId"),
  taskId: int("taskId"),
  createdByProfileId: int("createdByProfileId").notNull(),
  pinnedMessageId: int("pinnedMessageId"),
  pinnedByProfileId: int("pinnedByProfileId"),
  pinnedAt: timestamp("pinnedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("internal_conversations_created_by_idx").on(table.createdByProfileId, table.updatedAt), index("internal_conversations_unit_idx").on(table.unitId, table.updatedAt), index("internal_conversations_task_idx").on(table.taskId, table.updatedAt), index("internal_conversations_type_idx").on(table.conversationType, table.updatedAt), index("internal_conversations_pinned_message_idx").on(table.pinnedMessageId)]);

export const conversationParticipants = mysqlTable("conversation_participants", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  profileId: int("profileId").notNull(),
  lastReadAt: timestamp("lastReadAt"),
  typingUntil: timestamp("typingUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("conversation_participants_unique").on(table.conversationId, table.profileId), index("conversation_participants_profile_idx").on(table.profileId, table.lastReadAt), index("conversation_participants_typing_idx").on(table.conversationId, table.typingUntil)]);

export const conversationMessages = mysqlTable("conversation_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderProfileId: int("senderProfileId").notNull(),
  replyToMessageId: int("replyToMessageId"),
  forwardedFromMessageId: int("forwardedFromMessageId"),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("conversation_messages_conversation_created_idx").on(table.conversationId, table.createdAt), index("conversation_messages_reply_idx").on(table.replyToMessageId), index("conversation_messages_forwarded_idx").on(table.forwardedFromMessageId)]);

export const conversationMessageReactions = mysqlTable("conversation_message_reactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  profileId: int("profileId").notNull(),
  reaction: varchar("reaction", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("conversation_message_reactions_unique").on(table.messageId, table.profileId, table.reaction), index("conversation_message_reactions_message_idx").on(table.messageId, table.createdAt)]);

export const conversationAttachments = mysqlTable("conversation_attachments", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 600 }).notNull(),
  uploadedByProfileId: int("uploadedByProfileId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("conversation_attachments_message_idx").on(table.messageId)]);

export const dataExportJobs = mysqlTable("data_export_jobs", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId"),
  requestedByUserId: int("requestedByUserId").notNull(),
  assignedArchiveProfileId: int("assignedArchiveProfileId"),
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed", "expired"]).default("queued").notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  storageUrl: varchar("storageUrl", { length: 600 }),
  sizeBytes: int("sizeBytes"),
  errorMessage: text("errorMessage"),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  expiresAt: timestamp("expiresAt"),
}, table => [index("data_export_jobs_unit_status_idx").on(table.unitId, table.status), index("data_export_jobs_requested_idx").on(table.requestedByUserId, table.requestedAt)]);

export const permissionDelegations = mysqlTable("permission_delegations", {
  id: int("id").autoincrement().primaryKey(),
  grantorUserId: int("grantorUserId").notNull(),
  delegateUserId: int("delegateUserId").notNull(),
  role: mysqlEnum("role", ["court_president", "assistant_president", "court_secretary", "human_resources_manager", "department_manager", "performance_monitor", "trainee_affairs_manager", "technical_support_manager", "technical_support_agent", "administrative_staff", "judicial_trainee", "judge"]).notNull(),
  unitId: int("unitId"),
  title: varchar("title", { length: 240 }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  status: mysqlEnum("status", ["active", "ended", "cancelled"]).default("active").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("permission_delegations_delegate_status_idx").on(table.delegateUserId, table.status),
  index("permission_delegations_dates_idx").on(table.startsAt, table.endsAt),
]);

export const userWorkPreferences = mysqlTable("user_work_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  workMode: mysqlEnum("workMode", ["employee", "manager"]).default("manager").notNull(),
  notificationsEnabled: boolean("notificationsEnabled").default(true).notNull(),
  dndUntil: timestamp("dndUntil"),
  seenHelpKeys: text("seenHelpKeys"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("user_work_preferences_user_unique").on(table.userId)]);
