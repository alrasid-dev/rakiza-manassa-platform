import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTaskById: vi.fn(async () => ({ id: 44, assigneeProfileId: 4, watcherProfileId: 8, archivedAt: null })),
  getProfileForUser: vi.fn(async () => ({ id: 4, userId: 9, fullName: "المكلف", unitId: 2, status: "active" })),
  getEffectiveRoles: vi.fn(async () => []),
  getAccessPermission: vi.fn(async () => "employee"),
  getActiveCourtRoleAssignments: vi.fn(async () => []),
  listTaskAttachments: vi.fn(async () => [{ id: 1, originalName: "ملف.pdf" }]),
  listTaskTimeline: vi.fn(async () => [{ id: 31, updateType: "progress", note: "إحالة إدارية: سبب الإحالة", actorName: "مدير القسم", attachments: [], mentions: [] }]),
  addTaskAttachment: vi.fn(async () => ({ id: 1, originalName: "ملف.pdf" })),
  addTaskProgressNote: vi.fn(async () => ({ id: 12, attachment: null, mentions: [] })),
  extractTaskAttachmentText: vi.fn(async () => ({ text: "نص مستخرج", mimeType: "application/pdf" })),
  translateTaskAttachmentText: vi.fn(async () => ({ translation: "Extracted text", targetLanguage: "en" })),
  summarizeTaskAttachmentText: vi.fn(async () => ({ summary: "ملخص موجز", sourceKind: "extracted" })),
}));

vi.mock("./court-service", async importOriginal => {
  const actual = await importOriginal<typeof import("./court-service")>();
  return {
    ...actual,
    getTaskById: mocks.getTaskById,
    getProfileForUser: mocks.getProfileForUser,
    getEffectiveRoles: mocks.getEffectiveRoles,
    getAccessPermission: mocks.getAccessPermission,
    getActiveCourtRoleAssignments: mocks.getActiveCourtRoleAssignments,
    listTaskAttachments: mocks.listTaskAttachments,
    listTaskTimeline: mocks.listTaskTimeline,
    addTaskAttachment: mocks.addTaskAttachment,
    addTaskProgressNote: mocks.addTaskProgressNote,
    extractTaskAttachmentText: mocks.extractTaskAttachmentText,
    translateTaskAttachmentText: mocks.translateTaskAttachmentText,
    summarizeTaskAttachmentText: mocks.summarizeTaskAttachmentText,
  };
});

import { courtRouter } from "./routers/court";

const adminCaller = () => courtRouter.createCaller({ user: { id: 9, role: "admin", email: "owner@court.example", name: "مالك", openId: "owner" } } as never);
const memberCaller = () => courtRouter.createCaller({ user: { id: 9, role: "user", email: "employee@court.example", name: "موظف", openId: "employee" } } as never);

describe("مساحة كتابة ومرفقات المهمة", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTaskById.mockResolvedValue({ id: 44, assigneeProfileId: 4, watcherProfileId: 8, archivedAt: null });
    mocks.getProfileForUser.mockResolvedValue({ id: 4, userId: 9, fullName: "المكلف", unitId: 2, status: "active" });
    mocks.getEffectiveRoles.mockResolvedValue([]);
    mocks.getAccessPermission.mockResolvedValue("employee");
    mocks.getActiveCourtRoleAssignments.mockResolvedValue([]);
  });

  it("يسمح للمكلف بحفظ تحديث عمل مستقل دون استدعاء مسار التعليقات المصعّد", async () => {
    const result = await adminCaller().tasks.addProgressNote({ taskId: 44, note: "تمت مراجعة المعاملة وإعداد المسودة." });
    expect(result).toEqual({ id: 12, attachment: null, mentions: [] });
    expect(mocks.addTaskProgressNote).toHaveBeenCalledWith({ taskId: 44, profileId: 4, actorUserId: 9, note: "تمت مراجعة المعاملة وإعداد المسودة." });
  });

  it("يمرر المرفق والإشارات ضمن التعليق العادي للمشارك فقط", async () => {
    await adminCaller().tasks.addProgressNote({ taskId: 44, note: "يرجى مراجعة المرفق", mentionedProfileIds: [8], attachment: { originalName: "مذكرة.pdf", mimeType: "application/pdf", contentBase64: "JVBERi0=" } });
    expect(mocks.addTaskProgressNote).toHaveBeenCalledWith({ taskId: 44, profileId: 4, actorUserId: 9, note: "يرجى مراجعة المرفق", mentionedProfileIds: [8], attachment: { originalName: "مذكرة.pdf", mimeType: "application/pdf", contentBase64: "JVBERi0=" } });
  });

  it("يعرض السجل الزمني للمشارك فقط", async () => {
    await expect(adminCaller().tasks.timeline({ taskId: 44 })).resolves.toEqual([{ id: 31, updateType: "progress", note: "إحالة إدارية: سبب الإحالة", actorName: "مدير القسم", attachments: [], mentions: [] }]);
    expect(mocks.listTaskTimeline).toHaveBeenCalledWith(44);
  });

  it("يسمح للمشارك بعرض المرفقات ورفعها ضمن نفس المهمة", async () => {
    await expect(adminCaller().tasks.attachments.list({ taskId: 44 })).resolves.toEqual([{ id: 1, originalName: "ملف.pdf" }]);
    await adminCaller().tasks.attachments.upload({ taskId: 44, attachment: { originalName: "خطاب.pdf", mimeType: "application/pdf", contentBase64: "JVBERi0=" } });
    expect(mocks.addTaskAttachment).toHaveBeenCalledWith(expect.objectContaining({ taskId: 44, actorUserId: 9, uploaderProfileId: 4 }));
  });

  it("يقصر استخراج النص على مرفق المهمة التي يشارك فيها المستخدم", async () => {
    await expect(adminCaller().tasks.attachments.extractText({ taskId: 44, attachmentId: 1 })).resolves.toEqual({ text: "نص مستخرج", mimeType: "application/pdf" });
    expect(mocks.extractTaskAttachmentText).toHaveBeenCalledWith({ taskId: 44, attachmentId: 1, actorUserId: 9 });
  });

  it("يترجم النص المستخرج للمشارك فقط مع تمرير اللغة المختارة", async () => {
    await expect(adminCaller().tasks.attachments.translateText({ taskId: 44, attachmentId: 1, text: "نص مستخرج", targetLanguage: "en" })).resolves.toEqual({ translation: "Extracted text", targetLanguage: "en" });
    expect(mocks.translateTaskAttachmentText).toHaveBeenCalledWith({ taskId: 44, attachmentId: 1, text: "نص مستخرج", targetLanguage: "en", actorUserId: 9 });
  });

  it("يلخص النص للمشارك فقط مع توثيق مصدره", async () => {
    await expect(adminCaller().tasks.attachments.summarizeText({ taskId: 44, attachmentId: 1, text: "نص مستخرج", sourceKind: "extracted" })).resolves.toEqual({ summary: "ملخص موجز", sourceKind: "extracted" });
    expect(mocks.summarizeTaskAttachmentText).toHaveBeenCalledWith({ taskId: 44, attachmentId: 1, text: "نص مستخرج", sourceKind: "extracted", actorUserId: 9 });
  });

  it("يرفض القراءة والكتابة لملف لا يشارك في المهمة", async () => {
    mocks.getProfileForUser.mockResolvedValue({ id: 77, userId: 9, fullName: "غير مشارك", unitId: 3, status: "active" });
    await expect(memberCaller().tasks.attachments.list({ taskId: 44 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(memberCaller().tasks.addProgressNote({ taskId: 44, note: "محاولة غير مصرح بها" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(memberCaller().tasks.timeline({ taskId: 44 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
