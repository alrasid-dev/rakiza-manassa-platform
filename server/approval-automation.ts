/** الاعتماد الآلي للمهام والطلبات: ثلاثة أوضاع (لا/نصف/كامل) مع تحقق قبل التأكيد. */

export type AutoApprovalMode = "off" | "half" | "full";
export type AutoApprovalScope = "tasks" | "requests" | "disciplinary" | "leaves";
export type AutoApprovalSettings = { mode: AutoApprovalMode; scope: AutoApprovalScope[] };

export type AutoApprovalCheck = { key: string; label: string; passed: boolean; reason?: string };
export type AutoApprovalDecision = { runChecks: boolean; autoApprove: boolean; needsConfirmation: boolean };

export const AUTO_APPROVAL_SCOPES: AutoApprovalScope[] = ["tasks", "requests", "disciplinary", "leaves"];
export const DEFAULT_AUTO_APPROVAL_SETTINGS: AutoApprovalSettings = { mode: "off", scope: ["tasks"] };

export function normalizeAutoApprovalSettings(value: unknown): AutoApprovalSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const mode: AutoApprovalMode = source.mode === "half" || source.mode === "full" ? source.mode : "off";
  const allowed = new Set<string>(AUTO_APPROVAL_SCOPES);
  const scope = Array.isArray(source.scope) ? source.scope.filter((item): item is AutoApprovalScope => typeof item === "string" && allowed.has(item)) : [];
  return { mode, scope: scope.length ? scope : ["tasks"] };
}

/** فحوصات التحقق الآلي: نجاح كل الفحوصات شرط للاعتماد الفوري في الوضع الكامل. */
export function runAutoApprovalChecks(input: {
  status: string;
  hasAttachments: boolean;
  checkedInToday: boolean;
  completedBeforeDeadline: boolean;
  noLeaveConflict: boolean;
}): { checks: AutoApprovalCheck[]; allPassed: boolean } {
  const checks: AutoApprovalCheck[] = [
    { key: "under_review", label: "المهمة بانتظار تأكيد المدير", passed: input.status === "under_review", reason: input.status === "under_review" ? undefined : "المهمة لم تُرسل للمراجعة بعد" },
    { key: "attachments", label: "المرفقات موجودة", passed: input.hasAttachments, reason: input.hasAttachments ? undefined : "لا توجد مرفقات للمهمة" },
    { key: "checked_in", label: "الموظف بصم اليوم", passed: input.checkedInToday, reason: input.checkedInToday ? undefined : "لا توجد بصمة دخول اليوم" },
    { key: "on_time", label: "أُنجزت قبل 14:45", passed: input.completedBeforeDeadline, reason: input.completedBeforeDeadline ? undefined : "أُنجزت بعد الموعد المحدد" },
    { key: "no_leave", label: "لا تعارض مع إجازة/استئذان", passed: input.noLeaveConflict, reason: input.noLeaveConflict ? undefined : "يوجد تعارض إجازة أو استئذان" },
  ];
  return { checks, allPassed: checks.every(check => check.passed) };
}

/** يقرر سلوك الاعتماد حسب الوضع ونطاق التطبيق ونتيجة الفحوصات. */
export function evaluateAutoApprovalDecision(settings: AutoApprovalSettings, scope: AutoApprovalScope, allPassed: boolean): AutoApprovalDecision {
  if (!settings.scope.includes(scope) || settings.mode === "off") return { runChecks: false, autoApprove: false, needsConfirmation: false };
  if (settings.mode === "half") return { runChecks: true, autoApprove: false, needsConfirmation: true };
  return { runChecks: true, autoApprove: allPassed, needsConfirmation: !allPassed };
}
