import { describe, expect, it } from "vitest";
import { evaluateAutoApprovalDecision, normalizeAutoApprovalSettings, runAutoApprovalChecks } from "./approval-automation";

const passingTask = { status: "under_review", hasAttachments: true, checkedInToday: true, completedBeforeDeadline: true, noLeaveConflict: true };

describe("الاعتماد الآلي (3 أوضاع)", () => {
  it("وضع off: يدوي — لا تشغيل فحوصات ولا اعتماد تلقائي", () => {
    const settings = normalizeAutoApprovalSettings({ mode: "off", scope: ["tasks"] });
    expect(evaluateAutoApprovalDecision(settings, "tasks", true)).toEqual({ runChecks: false, autoApprove: false, needsConfirmation: false });
  });

  it("وضع half: تحقق تلقائي ثم عرض النتيجة قبل التأكيد اليدوي", () => {
    const settings = normalizeAutoApprovalSettings({ mode: "half", scope: ["tasks"] });
    expect(evaluateAutoApprovalDecision(settings, "tasks", true)).toEqual({ runChecks: true, autoApprove: false, needsConfirmation: true });
  });

  it("وضع full: نجاح كل الفحوصات → اعتماد فوري", () => {
    const settings = normalizeAutoApprovalSettings({ mode: "full", scope: ["tasks"] });
    expect(evaluateAutoApprovalDecision(settings, "tasks", true)).toEqual({ runChecks: true, autoApprove: true, needsConfirmation: false });
  });

  it("وضع full: فشل فحص → لا اعتماد تلقائي ويُطلب قرار يدوي (إشعار للمدير)", () => {
    const settings = normalizeAutoApprovalSettings({ mode: "full", scope: ["tasks"] });
    const { checks, allPassed } = runAutoApprovalChecks({ ...passingTask, checkedInToday: false });
    expect(allPassed).toBe(false);
    expect(checks.find(c => c.key === "checked_in")?.passed).toBe(false);
    expect(evaluateAutoApprovalDecision(settings, "tasks", allPassed)).toEqual({ runChecks: true, autoApprove: false, needsConfirmation: true });
  });

  it("سجل التدقيق: نتيجة القرار تحمل الوضع ونطاق التطبيق وقرار الاعتماد", () => {
    const settings = normalizeAutoApprovalSettings({ mode: "full", scope: ["tasks"] });
    const { allPassed } = runAutoApprovalChecks(passingTask);
    const decision = evaluateAutoApprovalDecision(settings, "tasks", allPassed);
    // يُسجَّل في audit: mode + scope + decision.autoApprove (approved/rejected).
    expect({ mode: settings.mode, scope: settings.scope, approved: decision.autoApprove }).toEqual({ mode: "full", scope: ["tasks"], approved: true });
  });

  it("نطاق غير مفعّل (مثل الإجازات عند scope=tasks فقط) → لا تشغيل فحوصات", () => {
    const settings = normalizeAutoApprovalSettings({ mode: "full", scope: ["tasks"] });
    expect(evaluateAutoApprovalDecision(settings, "leaves", true)).toEqual({ runChecks: false, autoApprove: false, needsConfirmation: false });
  });

  it("يُطبّع قيماً غير صالحة إلى الوضع الآمن off", () => {
    expect(normalizeAutoApprovalSettings({ mode: "bogus", scope: ["tasks", "unknown"] }).mode).toBe("off");
    expect(normalizeAutoApprovalSettings({ mode: "bogus", scope: ["tasks", "unknown"] }).scope).toEqual(["tasks"]);
  });
});
