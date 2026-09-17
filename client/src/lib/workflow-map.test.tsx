import { describe, expect, it } from "vitest";
import { autoAssignWorkflowSteps, canDistributeWorkflowPlan, normalizeWorkflowName, workflowAssignmentSummary, workflowMatchReasonLabel, workflowMethodLabel, workflowPriorityLabel, workflowStaffLabel, type WorkflowStaffOption } from "./workflow-map";

const staff: WorkflowStaffOption[] = [
  { id: 1, fullName: "سعد المطيري", unitId: 10, unitName: "قسم شؤون الملازمين", openWorkload: 2 },
  { id: 2, fullName: "نورة العتيبي", unitId: 11, unitName: "إدارة الخدمات المشتركة", openWorkload: 0 },
];

describe("معاينة التوزيع الآلي لمخطط سير العمل", () => {
  it("يطابق الاسم ثم وحدة المالك ثم يوازن الحمل", () => {
    const preview = autoAssignWorkflowSteps({
      steps: [
        { order: 1, title: "مراجعة تقرير سعد المطيري", ownerUnitHint: "" },
        { order: 2, title: "تجهيز ملف الصيانة", ownerUnitHint: "إدارة الخدمات المشتركة" },
        { order: 3, title: "خطوة بلا مالك محدد", ownerUnitHint: "" },
      ],
      staff,
    });
    expect(preview).toEqual([
      { order: 1, assigneeProfileId: 1, matchReason: "name" },
      { order: 2, assigneeProfileId: 2, matchReason: "unit" },
      { order: 3, assigneeProfileId: 2, matchReason: "balanced" },
    ]);
    expect(autoAssignWorkflowSteps({ steps: [{ order: 1, title: "خطوة" }], staff: [] })).toEqual([]);
    expect(autoAssignWorkflowSteps({ steps: [], staff })).toEqual([]);
  });

  it("يوحّد الاختلافات الإملائية في الأسماء العربية عند المطابقة", () => {
    expect(normalizeWorkflowName("أحمد العتيبي")).toBe(normalizeWorkflowName("احمد العتيبى"));
    const preview = autoAssignWorkflowSteps({ steps: [{ order: 1, title: "إعداد محضر نورة العتيبي", ownerUnitHint: "" }], staff });
    expect(preview[0]!.assigneeProfileId).toBe(2);
  });

  it("يصوغ ملخص التوزيع والتسميات العربية للحالة", () => {
    expect(workflowAssignmentSummary([{ matchReason: "name" }, { matchReason: "unit" }, { matchReason: "balanced" }, { matchReason: "balanced" }])).toBe("التوزيع المقترح: 1 بمطابقة الاسم · 1 بوحدة المالك · 2 بالتوزيع المتوازن");
    expect(workflowAssignmentSummary([])).toBe("لا يوجد توزيع مقترح بعد.");
    expect(workflowMethodLabel("ocr")).toBe("قراءة ذكية بالذكاء الاصطناعي (OCR)");
    expect(workflowMethodLabel("sheet")).toBe("قراءة مباشرة من ملف Excel");
    expect(workflowMethodLabel("docx")).toBe("قراءة مباشرة من ملف Word");
    expect(workflowMethodLabel("text")).toBe("قراءة مباشرة من ملف نصي");
    expect(workflowMethodLabel("heuristic")).toBe("استخراج حرفي لبنود الإجراءات");
    expect(workflowMethodLabel()).toBe("قراءة المستند");
    expect(workflowPriorityLabel("critical")).toBe("حرجة");
    expect(workflowPriorityLabel("high")).toBe("مرتفعة");
    expect(workflowPriorityLabel("normal")).toBe("عادية");
    expect(workflowMatchReasonLabel("name")).toBe("بمطابقة الاسم");
    expect(workflowMatchReasonLabel("unit")).toBe("بوحدة المالك");
    expect(workflowMatchReasonLabel("balanced")).toBe("بالتوزيع المتوازن");
    expect(workflowStaffLabel(staff[0])).toBe("سعد المطيري · قسم شؤون الملازمين (2 مهمة مفتوحة)");
    expect(workflowStaffLabel({ ...staff[0]!, unitName: "" })).toBe("سعد المطيري (2 مهمة مفتوحة)");
    expect(workflowStaffLabel()).toBe("بلا منفذ");
  });

  it("يمنع التوزيع عند نقص الخطوات أو الموظفين أو الإسناد اليدوي", () => {
    expect(canDistributeWorkflowPlan({ steps: 0, mode: "auto", staffCount: 3, assignedCount: 0 })).toEqual({ ok: false, reason: "حلّل مستنداً أولاً لاستخراج خطوات المخطط." });
    expect(canDistributeWorkflowPlan({ steps: 3, mode: "auto", staffCount: 0, assignedCount: 0 })).toEqual({ ok: false, reason: "لا يوجد موظف متاح للإسناد في نطاقك." });
    expect(canDistributeWorkflowPlan({ steps: 3, mode: "manual", staffCount: 2, assignedCount: 1 })).toEqual({ ok: false, reason: "اختر منفذاً لكل خطوة (1 من 3)." });
    expect(canDistributeWorkflowPlan({ steps: 3, mode: "auto", staffCount: 2, assignedCount: 3, isPending: true })).toEqual({ ok: false, reason: "جارٍ إنشاء المهام..." });
    expect(canDistributeWorkflowPlan({ steps: 3, mode: "auto", staffCount: 2, assignedCount: 3 })).toEqual({ ok: true, reason: "سيعتمد النظام الاقتراح الآلي للمنفذين عند الإنشاء." });
    expect(canDistributeWorkflowPlan({ steps: 2, mode: "manual", staffCount: 2, assignedCount: 2 })).toEqual({ ok: true, reason: "سيُسند كل منفذ كما حددته يدوياً." });
  });
});
