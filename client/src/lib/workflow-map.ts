/** مساعدات واجهة مخطط سير العمل: معاينة التوزيع الآلي وصياغة الحالات والملخصات. */

export type WorkflowPlanStep = { order: number; title: string; description: string; ownerUnitHint: string; deliverable: string; slaDays: number; dependsOnOrder: number | null };
export type WorkflowStaffOption = { id: number; fullName: string; unitId: number | null; unitName: string; openWorkload: number };
export type WorkflowMatchReason = "name" | "unit" | "balanced";
export type WorkflowAssignmentPreview = { order: number; assigneeProfileId: number; matchReason: WorkflowMatchReason };
export type WorkflowDistributionMode = "auto" | "manual";
export type WorkflowPriority = "normal" | "high" | "critical";

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g;

export function normalizeWorkflowName(value: string) {
  return String(value ?? "")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar");
}

export function workflowMethodLabel(method?: string | null) {
  if (method === "docx") return "قراءة مباشرة من ملف Word";
  if (method === "sheet") return "قراءة مباشرة من ملف Excel";
  if (method === "text") return "قراءة مباشرة من ملف نصي";
  if (method === "ocr") return "قراءة ذكية بالذكاء الاصطناعي (OCR)";
  if (method === "heuristic") return "استخراج حرفي لبنود الإجراءات";
  return "قراءة المستند";
}

export function workflowPriorityLabel(priority: WorkflowPriority) {
  if (priority === "high") return "مرتفعة";
  if (priority === "critical") return "حرجة";
  return "عادية";
}

export function workflowMatchReasonLabel(reason: WorkflowMatchReason) {
  if (reason === "name") return "بمطابقة الاسم";
  if (reason === "unit") return "بوحدة المالك";
  return "بالتوزيع المتوازن";
}

function staffMatchesName(title: string, member: WorkflowStaffOption) {
  const haystack = normalizeWorkflowName(title);
  if (haystack.length < 4) return false;
  const name = normalizeWorkflowName(member.fullName);
  if (name.length >= 4 && haystack.includes(name)) return true;
  const parts = name.split(" ").filter(part => part.length >= 3);
  return parts.length > 1 && parts.every(part => haystack.includes(part));
}

/** معاينة التوزيع الآلي في الواجهة: مطابقة الاسم، ثم وحدة المالك، ثم الأقل حملاً. */
export function autoAssignWorkflowSteps(input: { steps: Array<Pick<WorkflowPlanStep, "order" | "title" | "ownerUnitHint">>; staff: WorkflowStaffOption[] }): WorkflowAssignmentPreview[] {
  const staff = (input.staff ?? []).filter(member => Number.isFinite(member.id));
  if (!staff.length || !(input.steps ?? []).length) return [];
  const workload = new Map(staff.map(member => [member.id, Math.max(0, Math.trunc(member.openWorkload ?? 0))]));
  const pickLeastLoaded = () => [...staff].sort((a, b) => (workload.get(a.id)! - workload.get(b.id)!) || a.id - b.id)[0]!;
  return input.steps.map(step => {
    let member = staff.find(candidate => staffMatchesName(step.title, candidate));
    let matchReason: WorkflowMatchReason = "name";
    if (!member && step.ownerUnitHint) {
      const hint = normalizeWorkflowName(step.ownerUnitHint);
      const unitMatches = staff.filter(candidate => {
        const unit = normalizeWorkflowName(candidate.unitName);
        return unit.length >= 3 && hint.length >= 3 && (unit.includes(hint) || hint.includes(unit));
      });
      if (unitMatches.length) {
        member = unitMatches.sort((a, b) => (workload.get(a.id)! - workload.get(b.id)!) || a.id - b.id)[0]!;
        matchReason = "unit";
      }
    }
    if (!member) {
      member = pickLeastLoaded();
      matchReason = "balanced";
    }
    workload.set(member.id, workload.get(member.id)! + 1);
    return { order: step.order, assigneeProfileId: member.id, matchReason };
  });
}

export function workflowAssignmentSummary(assignments: Array<{ matchReason: WorkflowMatchReason }>) {
  const counts = { name: 0, unit: 0, balanced: 0 };
  (assignments ?? []).forEach(assignment => { counts[assignment.matchReason] += 1; });
  const parts: string[] = [];
  if (counts.name) parts.push(`${counts.name} بمطابقة الاسم`);
  if (counts.unit) parts.push(`${counts.unit} بوحدة المالك`);
  if (counts.balanced) parts.push(`${counts.balanced} بالتوزيع المتوازن`);
  return parts.length ? `التوزيع المقترح: ${parts.join(" · ")}` : "لا يوجد توزيع مقترح بعد.";
}

export function workflowStaffLabel(member?: WorkflowStaffOption | null) {
  if (!member) return "بلا منفذ";
  return member.unitName ? `${member.fullName} · ${member.unitName} (${member.openWorkload} مهمة مفتوحة)` : `${member.fullName} (${member.openWorkload} مهمة مفتوحة)`;
}

/**
 * يحدد جاهزية التوزيع وسبب المنع بصياغة واضحة للمستخدم:
 * التوزيع الآلي يحتاج خطوات وموظفين متاحين، واليدوي يحتاج منفذاً لكل خطوة.
 */
export function canDistributeWorkflowPlan(input: { steps: number; mode: WorkflowDistributionMode; staffCount: number; assignedCount: number; isPending?: boolean }) {
  if (!input.steps) return { ok: false, reason: "حلّل مستنداً أولاً لاستخراج خطوات المخطط." };
  if (!input.staffCount) return { ok: false, reason: "لا يوجد موظف متاح للإسناد في نطاقك." };
  if (input.isPending) return { ok: false, reason: "جارٍ إنشاء المهام..." };
  if (input.mode === "manual" && input.assignedCount < input.steps) return { ok: false, reason: `اختر منفذاً لكل خطوة (${input.assignedCount} من ${input.steps}).` };
  return { ok: true, reason: input.mode === "auto" ? "سيعتمد النظام الاقتراح الآلي للمنفذين عند الإنشاء." : "سيُسند كل منفذ كما حددته يدوياً." };
}
