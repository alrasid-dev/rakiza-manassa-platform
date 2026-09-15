import { describe, expect, it } from "vitest";
import { cycleTaskAttachmentIndex, isPreviewableTaskAttachment, isPreviewableTaskImage, splitTextByQuery, taskStateBadgeClasses, taskStateIcon, taskVisualClasses, taskVisualState } from "./TasksWorkspaceContent";

const now = Date.parse("2026-08-25T08:00:00Z");

describe("الحالة البصرية للمهام", () => {
  it("يعرض الأخضر للمهمة المكتملة", () => {
    expect(taskVisualState({ status: "completed", dueAt: "2026-08-24T08:00:00Z" }, now)).toBe("completed");
    expect(taskVisualClasses("completed")).toContain("f2f8f2");
  });

  it("يعرض الأصفر مع وميض خلال الأربع والعشرين ساعة السابقة للاستحقاق", () => {
    expect(taskVisualState({ status: "in_progress", dueAt: "2026-08-25T20:00:00Z" }, now)).toBe("due_soon");
    expect(taskVisualClasses("due_soon")).toContain("fffaf0");
    expect(taskVisualClasses("due_soon")).toContain("rakiza-task-due-soon");
  });

  it("يعرض الأحمر مع وميض عند بدء التأخير أو حالة التأخر الصريحة", () => {
    expect(taskVisualState({ status: "in_progress", dueAt: "2026-08-25T07:59:00Z" }, now)).toBe("overdue");
    expect(taskVisualState({ status: "overdue", dueAt: "2026-08-30T08:00:00Z" }, now)).toBe("overdue");
    expect(taskVisualClasses("overdue")).toContain("fff3ef");
    expect(taskVisualClasses("overdue")).toContain("rakiza-task-overdue");
  });

  it("يومض تنبيهياً للمهمة الجديدة القريبة من بدئها", () => {
    expect(taskVisualState({ status: "new", dueAt: "2026-08-30T08:00:00Z", scheduledFor: "2026-08-25T08:30:00Z" }, now)).toBe("starting");
    expect(taskVisualClasses("starting")).toContain("rakiza-task-starting");
  });

  it("يقترن لكل حالة أيقونة مناسبة مع لونها", () => {
    expect(taskStateIcon("starting").label).toBe("بدء المهمة");
    expect(taskStateIcon("due_soon").label).toBe("قرب الاستحقاق");
    expect(taskStateIcon("overdue").label).toBe("تأخير عاجل");
    expect(taskStateIcon("completed").label).toBe("منجزة");
    expect(taskStateIcon("starting").icon).toBeTruthy();
    expect(taskStateBadgeClasses("overdue")).toContain("9d4034");
    expect(taskStateBadgeClasses("due_soon")).toContain("80642b");
    expect(taskStateBadgeClasses("starting")).toContain("1c6b3f");
  });

  it("يقصر المعاينة داخل المتصفح على صور PNG وJPEG", () => {
    expect(isPreviewableTaskImage("image/png")).toBe(true);
    expect(isPreviewableTaskImage("image/jpeg")).toBe(true);
    expect(isPreviewableTaskImage("application/pdf")).toBe(false);
    expect(isPreviewableTaskImage("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
  });

  it("يضيف PDF إلى نطاق المعاينة دون اعتبار المستندات المكتبية قابلة للعرض", () => {
    expect(isPreviewableTaskAttachment("application/pdf")).toBe(true);
    expect(isPreviewableTaskAttachment("image/jpeg")).toBe(true);
    expect(isPreviewableTaskAttachment("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(false);
  });

  it("يدور بين المرفقات السابقة والتالية دون تجاوز أول أو آخر عنصر", () => {
    expect(cycleTaskAttachmentIndex(0, 3, -1)).toBe(2);
    expect(cycleTaskAttachmentIndex(2, 3, 1)).toBe(0);
    expect(cycleTaskAttachmentIndex(0, 0, 1)).toBe(-1);
  });

  it("يقسم النص إلى نتائج مطابقة وغير مطابقة لتمييز البحث", () => {
    expect(splitTextByQuery("محكمة الرياض ومحكمة جدة", "محكمة").filter(part => part.matches)).toHaveLength(2);
    expect(splitTextByQuery("نص بلا تطابق", "غائب").some(part => part.matches)).toBe(false);
  });
});
