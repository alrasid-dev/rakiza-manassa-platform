import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_SIZE, MAX_UPLOAD_SIZE_LABEL } from "@shared/const";
import { buildZipArchiveBuffer, canBootstrapCustomConversationActor, canCreateCustomConversation, canPinConversationMessage, isSupportedInternalMessageReaction, normalizeConversationBody, packageConversationAttachments, validateConversationAttachment } from "./internal-communications-service";

describe("custom conversation actor policy", () => {
  it("allows only platform administrators or full-control leadership to bootstrap an actor profile", () => {
    expect(canBootstrapCustomConversationActor({ userRole: "admin", permission: null, roles: [] })).toBe(true);
    expect(canBootstrapCustomConversationActor({ userRole: "user", permission: "full_control", roles: [] })).toBe(true);
    expect(canBootstrapCustomConversationActor({ userRole: "user", permission: "view", roles: [] })).toBe(false);
  });

  it("يتيح إنشاء مجموعة لرئيس القسم أو القيادة أو صلاحية التحكم الكامل", () => {
    expect(canCreateCustomConversation([{ role: "department_manager" }], null)).toBe(true);
    expect(canCreateCustomConversation([{ role: "court_secretary" }], null)).toBe(true);
    expect(canCreateCustomConversation([], "full_control")).toBe(true);
    expect(canCreateCustomConversation([{ role: "employee" }], null)).toBe(false);
  });
});

describe("message pin policy", () => {
  const customGroup = { conversationType: "custom", unitId: null, createdByProfileId: 8 };

  it("يسمح لمنشئ المجموعة أو القيادة بتثبيت رسالة المجموعة فقط", () => {
    expect(canPinConversationMessage({ conversation: customGroup, profileId: 8, roles: [] })).toBe(true);
    expect(canPinConversationMessage({ conversation: customGroup, profileId: 3, roles: [{ role: "court_secretary", unitId: null }] })).toBe(true);
    expect(canPinConversationMessage({ conversation: customGroup, profileId: 3, roles: [] })).toBe(false);
  });

  it("يحجب تثبيت الرسائل في المحادثات الفردية", () => {
    expect(canPinConversationMessage({ conversation: { conversationType: "direct", unitId: null, createdByProfileId: 8 }, profileId: 8, roles: [] })).toBe(false);
  });
});

describe("message reactions policy", () => {
  it("يقبل رموز التفاعل المعتمدة فقط", () => {
    expect(isSupportedInternalMessageReaction("✅")).toBe(true);
    expect(isSupportedInternalMessageReaction("👍")).toBe(true);
    expect(isSupportedInternalMessageReaction("❤️")).toBe(false);
  });
});

describe("internal communications attachments", () => {
  it("allows an attachment-only message and rejects an empty message", () => {
    expect(normalizeConversationBody("", true)).toBe("مرفق");
    expect(() => normalizeConversationBody("  ", false)).toThrow("أرفق ملفاً");
  });

  it("accepts supported small attachments", () => {
    const result = validateConversationAttachment({ mimeType: "text/plain", contentBase64: Buffer.from("رسالة داخلية").toString("base64") });
    expect(result.toString()).toContain("رسالة");
  });

  it("accepts a valid PDF even when mobile browsers report a generic MIME type", () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
    const result = validateConversationAttachment({ mimeType: "application/octet-stream", contentBase64: pdf.toString("base64") });
    expect(result.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("rejects PDF MIME with non-PDF content", () => {
    expect(() => validateConversationAttachment({ mimeType: "application/pdf", contentBase64: Buffer.from("not a pdf").toString("base64") })).toThrow("PDF");
  });

  it("rejects unsupported mime types", () => {
    expect(() => validateConversationAttachment({ mimeType: "application/zip", contentBase64: Buffer.from("x").toString("base64") })).toThrow("نوع المرفق");
  });

  it("rejects attachments over the upload size limit", () => {
    const contentBase64 = Buffer.alloc(MAX_UPLOAD_SIZE + 1, 1).toString("base64");
    expect(() => validateConversationAttachment({ mimeType: "text/plain", contentBase64 })).toThrow(MAX_UPLOAD_SIZE_LABEL);
  });

  it("builds a valid ZIP buffer with the expected entry names", async () => {
    const zip = await buildZipArchiveBuffer([
      { name: "manifest.json", content: JSON.stringify({ version: 1 }) },
      { name: "people.json", content: JSON.stringify([{ id: 1 }]) },
    ]);
    expect(zip.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(zip.toString("utf8")).toContain("manifest.json");
    expect(zip.toString("utf8")).toContain("people.json");
  });

  it("ينظم أكثر من خمسة مرفقات في حزم ZIP قابلة للإرسال", async () => {
    const attachments = Array.from({ length: 6 }, (_, index) => ({ originalName: `ملف-${index + 1}.txt`, mimeType: "text/plain", contentBase64: Buffer.from(`محتوى ${index + 1}`).toString("base64") }));
    const result = await packageConversationAttachments({ attachments });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ mimeType: "application/zip" });
    expect(Buffer.from(result[0].contentBase64, "base64").subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("لا يقبل التغليف عند خمسة مرفقات أو أقل", async () => {
    const attachments = Array.from({ length: 5 }, (_, index) => ({ originalName: `ملف-${index + 1}.txt`, mimeType: "text/plain", contentBase64: Buffer.from("محتوى").toString("base64") }));
    await expect(packageConversationAttachments({ attachments })).rejects.toThrow("تجاوز خمسة مرفقات");
  });
});
