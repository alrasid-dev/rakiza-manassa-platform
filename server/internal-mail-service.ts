import { TRPCError } from "@trpc/server";

import { and, asc, desc, eq, gte, inArray, isNull, like, lte, ne, or, sql } from "drizzle-orm";
import { internalMailAssistantActions, internalMailAttachments, internalMailContacts, internalMailEntries, internalMailMessages, internalMailPreferences, internalMailRecurringScheduleRuns, internalMailRecurringSchedules, internalMailRules, internalMailTemplates, personProfiles } from "../drizzle/schema";
import { getDb } from "./db";
import { getProfileForUser, logAudit } from "./court-service";
import { storageGetSignedUrl, storagePut } from "./storage";
import { validateConversationAttachment } from "./internal-communications-service";
import { invokeLLM } from "./_core/llm";

export type InternalMailRecipientType = "to" | "cc" | "bcc";
export type InternalMailFolder = "inbox" | "sent" | "drafts" | "starred" | "archive" | "trash";
type MailAttachmentInput = { originalName: string; mimeType: string; contentBase64: string };
type MailRecipients = { toProfileIds: number[]; ccProfileIds: number[]; bccProfileIds: number[] };
type SignatureImageInput = { originalName: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; contentBase64: string };
export type InternalMailAssistantMode = "off" | "draft" | "auto_reply" | "auto_forward";
export type InternalMailRecurringFrequency = "daily" | "weekly" | "monthly";
export type InternalMailRecurringRule = { frequency: InternalMailRecurringFrequency; intervalCount: number; weekdays?: number[]; monthDay?: number | null; startsAt: Date; endsAt?: Date | null };
const ALLOWED_MAIL_TAGS = new Set(["p", "div", "span", "font", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "a"]);
const SIGNATURE_IMAGE_PREFIX = "/manus-storage/internal-mail-signatures/";

async function getMailActor(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const profile = await getProfileForUser(userId);
  if (!profile || profile.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "يلزم ملف موظف نشط لاستخدام بريد ركيزة." });
  return { db, profile };
}

function normalizeIds(values: number[], excluded = new Set<number>()) {
  return Array.from(new Set(values.filter(value => Number.isInteger(value) && value > 0 && !excluded.has(value))));
}

export function normalizeInternalMailRecipients(input: MailRecipients, senderProfileId: number) {
  const excluded = new Set([senderProfileId]);
  const toProfileIds = normalizeIds(input.toProfileIds, excluded);
  toProfileIds.forEach(id => excluded.add(id));
  const ccProfileIds = normalizeIds(input.ccProfileIds, excluded);
  ccProfileIds.forEach(id => excluded.add(id));
  const bccProfileIds = normalizeIds(input.bccProfileIds, excluded);
  return { toProfileIds, ccProfileIds, bccProfileIds };
}

async function assertRecipientsAreActive(db: Awaited<ReturnType<typeof getDb>> & {}, ids: number[]) {
  if (!ids.length) return;
  const recipients = await db.select({ id: personProfiles.id }).from(personProfiles).where(and(inArray(personProfiles.id, ids), eq(personProfiles.status, "active")));
  if (recipients.length !== ids.length) throw new Error("أحد مستلمي البريد غير موجود أو غير نشط.");
}

async function setMailRecipients(input: { db: Awaited<ReturnType<typeof getDb>> & {}; messageId: number; senderProfileId: number; recipients: MailRecipients }) {
  const recipients = normalizeInternalMailRecipients(input.recipients, input.senderProfileId);
  const allIds = [...recipients.toProfileIds, ...recipients.ccProfileIds, ...recipients.bccProfileIds];
  await assertRecipientsAreActive(input.db, allIds);
  await input.db.delete(internalMailEntries).where(and(eq(internalMailEntries.messageId, input.messageId), ne(internalMailEntries.recipientType, "sender")));
  if (allIds.length) await input.db.insert(internalMailEntries).values([
    ...recipients.toProfileIds.map(profileId => ({ messageId: input.messageId, profileId, recipientType: "to" as const })),
    ...recipients.ccProfileIds.map(profileId => ({ messageId: input.messageId, profileId, recipientType: "cc" as const })),
    ...recipients.bccProfileIds.map(profileId => ({ messageId: input.messageId, profileId, recipientType: "bcc" as const })),
  ]);
  return recipients;
}

function cleanText(value: string, max: number) { return value.trim().slice(0, max); }

export function sanitizeInternalMailHtml(value: string) {
  const source = value.slice(0, 80_000).replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?(?:script|style|iframe|object|embed|form|svg|math)[^>]*>/gi, "");
  return source.replace(/<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/gi, (_match, closing: string, rawTag: string, attributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_MAIL_TAGS.has(tag) && tag !== "img") return "";
    if (closing) return tag === "br" ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "img") {
      const src = attributes.match(/\bsrc\s*=\s*["']?([^\s"'>]+)/i)?.[1] || "";
      if (!src.startsWith(SIGNATURE_IMAGE_PREFIX)) return "";
      const alt = (attributes.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || "توقيع البريد").replace(/[<>"&]/g, "").slice(0, 120);
      return `<img src="${src.replace(/"/g, "%22")}" alt="${alt}" data-signature-image="true">`;
    }
    if (tag === "font") {
      const color = attributes.match(/\bcolor\s*=\s*["']?(#[0-9a-f]{3,8})/i)?.[1] || "";
      const face = attributes.match(/\bface\s*=\s*["']?([a-z0-9 ,_-]{1,80})/i)?.[1]?.trim() || "";
      const size = attributes.match(/\bsize\s*=\s*["']?([1-7])/i)?.[1] || "";
      return `<font${color ? ` color="${color}"` : ""}${face ? ` face="${face.replace(/"/g, "")}"` : ""}${size ? ` size="${size}"` : ""}>`;
    }
    if (["p", "div", "span"].includes(tag)) {
      const align = attributes.match(/\b(?:style\s*=\s*["'][^"']*)?text-align\s*:\s*(right|left|center|justify)/i)?.[1]?.toLowerCase();
      return `<${tag}${align ? ` style="text-align:${align}"` : ""}>`;
    }
    if (tag !== "a") return `<${tag}>`;
    const href = attributes.match(/\bhref\s*=\s*["']?([^\s"'>]+)/i)?.[1] || "";
    const safeHref = /^(https?:|mailto:)/i.test(href) ? href.replace(/"/g, "%22") : "";
    return safeHref ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">` : "<a>";
  });
}

export function richTextToPlainText(value: string) {
  return cleanText(value.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|li|blockquote|h[1-6])\s*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, "> ").replace(/\n{3,}/g, "\n\n"), 50_000);
}

async function resolveInternalMailThread(input: { db: Awaited<ReturnType<typeof getDb>> & {}; profileId: number; parentMessageId?: number | null }) {
  if (!input.parentMessageId) return { parentMessageId: null, threadId: null };
  const parent = (await input.db.select({ message: internalMailMessages }).from(internalMailEntries)
    .innerJoin(internalMailMessages, eq(internalMailMessages.id, internalMailEntries.messageId))
    .where(and(eq(internalMailEntries.messageId, input.parentMessageId), eq(internalMailEntries.profileId, input.profileId))).limit(1))[0];
  if (!parent) throw new Error("لا تملك صلاحية الرد على هذه الرسالة.");
  return { parentMessageId: parent.message.id, threadId: parent.message.threadId ?? parent.message.id };
}

function llmText(content: unknown) {
  return (typeof content === "string" ? content : Array.isArray(content) ? content.filter((part: any) => part?.type === "text").map((part: any) => part.text).join("\n") : "").trim();
}

export function buildInternalMailSummaryMessages(subject: string, body: string) {
  return [
    { role: "system" as const, content: "لخّص رسالة بريد داخلية بدقة وبالعربية. اذكر الوقائع والتعليمات والقرارات والمواعيد الظاهرة فقط، ولا تخترع معلومات أو تفسيرات. اكتب عنواناً قصيراً ثم من 3 إلى 7 نقاط موجزة. إذا لم توجد معلومات كافية فاذكر ذلك صراحة." },
    { role: "user" as const, content: `الموضوع: ${subject}\n\nنص الرسالة:\n${body}` },
  ];
}

export function buildInternalMailAssistantMessages(input: { subject: string; body: string; mode: "reply" | "proofread"; tone?: "formal" | "concise" }) {
  const tone = input.tone === "concise" ? "اجعل كل رد مباشراً ومختصراً جداً، في جملة أو جملتين عند الإمكان، مع المحافظة على الاحترام." : "استخدم نبرة رسمية مهذبة ملائمة للمراسلات الداخلية للمحكمة، بعبارات واضحة وغير مطولة.";
  const task = input.mode === "reply" ? `اقترح ثلاثة ردود داخلية عربية مهنية متفاوتة في الصياغة. ${tone} لا تضف وقائع أو التزامات غير موجودة في الرسالة.` : "صحح الصياغة العربية فقط مع الحفاظ التام على المعنى، ثم اذكر حتى ثلاث ملاحظات لغوية موجزة. لا تضف معلومات جديدة.";
  return [
    { role: "system" as const, content: `أنت مساعد بريد داخلي للمحكمة. ${task} لا تنفذ أي إجراء ولا تذكر أنها استشارة قانونية. أعد JSON مطابقاً للمخطط فقط.` },
    { role: "user" as const, content: `الموضوع: ${input.subject}\n\nالنص:\n${input.body.slice(0, 12_000)}` },
  ];
}

export async function saveInternalMailDraft(input: { userId: number; messageId?: number; parentMessageId?: number | null; subject: string; body: string; bodyHtml?: string | null; importance: "normal" | "high"; recipients: MailRecipients; attachments?: MailAttachmentInput[] }) {
  const { db, profile } = await getMailActor(input.userId);
  const subject = cleanText(input.subject, 255) || "(بدون موضوع)";
  const bodyHtml = input.bodyHtml ? sanitizeInternalMailHtml(input.bodyHtml) : null;
  const body = cleanText(input.body || (bodyHtml ? richTextToPlainText(bodyHtml) : ""), 50_000);
  let messageId = input.messageId;
  if (messageId) {
    const existing = (await db.select().from(internalMailMessages).where(eq(internalMailMessages.id, messageId)).limit(1))[0];
    if (!existing || existing.senderProfileId !== profile.id || existing.status !== "draft") throw new Error("لا تملك تعديل هذه المسودة.");
    const thread = await resolveInternalMailThread({ db, profileId: profile.id, parentMessageId: input.parentMessageId ?? existing.parentMessageId });
    await db.update(internalMailMessages).set({ subject, body, bodyHtml, importance: input.importance, parentMessageId: thread.parentMessageId, threadId: thread.threadId, updatedAt: new Date() }).where(eq(internalMailMessages.id, messageId));
  } else {
    const thread = await resolveInternalMailThread({ db, profileId: profile.id, parentMessageId: input.parentMessageId });
    const created = await db.insert(internalMailMessages).values({ senderProfileId: profile.id, parentMessageId: thread.parentMessageId, threadId: thread.threadId, subject, body, bodyHtml, importance: input.importance, status: "draft" });
    messageId = Number(created[0].insertId);
    await db.insert(internalMailEntries).values({ messageId, profileId: profile.id, recipientType: "sender", isRead: true, readAt: new Date() });
  }
  await setMailRecipients({ db, messageId, senderProfileId: profile.id, recipients: input.recipients });
  for (const attachment of input.attachments ?? []) await addInternalMailAttachment({ db, messageId, profileId: profile.id, attachment });
  await logAudit({ actorUserId: input.userId, action: "internal_mail.draft.saved", entityType: "internal_mail_message", entityId: messageId, metadata: { hasRecipients: Boolean(input.recipients.toProfileIds.length || input.recipients.ccProfileIds.length || input.recipients.bccProfileIds.length), attachments: input.attachments?.length ?? 0 } });
  return { messageId };
}

export async function sendInternalMail(input: { userId: number; messageId: number }) {
  const { db, profile } = await getMailActor(input.userId);
  const message = (await db.select().from(internalMailMessages).where(eq(internalMailMessages.id, input.messageId)).limit(1))[0];
  if (!message || message.senderProfileId !== profile.id || message.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "هذه المسودة غير متاحة للإرسال. تأكد من أنها ملكك وما زالت في وضع المسودة." });
  const recipients = await db.select({ id: internalMailEntries.id }).from(internalMailEntries).where(and(eq(internalMailEntries.messageId, message.id), ne(internalMailEntries.recipientType, "sender"))).limit(1);
  if (!recipients.length) throw new TRPCError({ code: "BAD_REQUEST", message: "أضف مستلماً واحداً على الأقل قبل الإرسال." });
  const sentAt = new Date();
  await db.update(internalMailMessages).set({ status: "sent", sentAt, scheduledAt: null, threadId: message.threadId ?? message.id, updatedAt: sentAt }).where(eq(internalMailMessages.id, message.id));
  await applyInternalMailRules({ db, messageId: message.id, senderProfileId: profile.id, subject: message.subject });
  await recordInternalMailContacts({ db, profileId: profile.id, messageId: message.id });
  try { await processInternalMailAssistantActions({ messageId: message.id }); } catch (error) { await logAudit({ actorUserId: input.userId, action: "internal_mail.assistant.dispatch_failed", entityType: "internal_mail_message", entityId: message.id, metadata: { reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" } }); }
  await logAudit({ actorUserId: input.userId, action: "internal_mail.sent", entityType: "internal_mail_message", entityId: message.id, metadata: { importance: message.importance } });
  return { messageId: message.id, sentAt };
}

async function recordInternalMailContacts(input: { db: Awaited<ReturnType<typeof getDb>> & {}; profileId: number; messageId: number }) {
  const recipients = await input.db.select({ profileId: internalMailEntries.profileId }).from(internalMailEntries).where(and(eq(internalMailEntries.messageId, input.messageId), ne(internalMailEntries.recipientType, "sender")));
  for (const recipient of recipients) {
    const existing = (await input.db.select().from(internalMailContacts).where(and(eq(internalMailContacts.profileId, input.profileId), eq(internalMailContacts.contactProfileId, recipient.profileId))).limit(1))[0];
    if (existing) await input.db.update(internalMailContacts).set({ lastUsedAt: new Date() }).where(eq(internalMailContacts.id, existing.id));
    else await input.db.insert(internalMailContacts).values({ profileId: input.profileId, contactProfileId: recipient.profileId, isFavorite: false, lastUsedAt: new Date() });
  }
}

async function applyInternalMailRules(input: { db: Awaited<ReturnType<typeof getDb>> & {}; messageId: number; senderProfileId: number; subject: string }) {
  const sender = (await input.db.select({ fullName: personProfiles.fullName }).from(personProfiles).where(eq(personProfiles.id, input.senderProfileId)).limit(1))[0];
  const entries = await input.db.select().from(internalMailEntries).where(and(eq(internalMailEntries.messageId, input.messageId), ne(internalMailEntries.recipientType, "sender")));
  for (const entry of entries) {
    const rules = await input.db.select().from(internalMailRules).where(and(eq(internalMailRules.profileId, entry.profileId), eq(internalMailRules.isEnabled, true)));
    for (const rule of rules) {
      const subjectMatches = !rule.subjectContains || input.subject.toLowerCase().includes(rule.subjectContains.toLowerCase());
      const senderMatches = !rule.senderContains || (sender?.fullName || "").toLowerCase().includes(rule.senderContains.toLowerCase());
      if (!subjectMatches || !senderMatches) continue;
      const patch = rule.action === "star" ? { isStarred: true } : rule.action === "archive" ? { archivedAt: new Date() } : { category: rule.category || null };
      await input.db.update(internalMailEntries).set(patch).where(eq(internalMailEntries.id, entry.id));
      break;
    }
  }
}

function internalMailPlainTextToHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

export function canProcessInternalMailAssistantAction(input: { automationAction: "none" | "draft" | "reply" | "forward"; recipientType: "sender" | "to" | "cc" | "bcc"; sourceSenderProfileId: number; recipientProfileId: number; entryCategory?: string | null; sourceSubject: string; subjectContains?: string | null }) {
  if (input.automationAction !== "none" || input.recipientType === "sender" || input.recipientType === "bcc" || input.sourceSenderProfileId === input.recipientProfileId) return false;
  if (input.entryCategory === "سري" || /سري|confidential/i.test(input.sourceSubject)) return false;
  return !input.subjectContains || input.sourceSubject.toLocaleLowerCase("ar-SA").includes(input.subjectContains.toLocaleLowerCase("ar-SA"));
}

function internalMailSignature(input: { signature?: string | null; signatureImageStorageUrl?: string | null }) {
  const text = cleanText(input.signature || "", 3_000);
  const image = input.signatureImageStorageUrl?.startsWith(SIGNATURE_IMAGE_PREFIX) ? `<br><img src="${input.signatureImageStorageUrl}" alt="توقيع البريد" data-signature-image="true">` : "";
  if (!text && !image) return { body: "", bodyHtml: "" };
  return { body: `${text ? `\n\n--\n${text}` : ""}${image ? "\n[صورة التوقيع]" : ""}`, bodyHtml: `<p><br>--<br>${internalMailPlainTextToHtml(text)}${image}</p>` };
}

async function generateInternalMailAutoReply(input: { subject: string; body: string }) {
  const result = await invokeLLM({
    model: "gpt-5-mini",
    maxTokens: 1_400,
    messages: buildInternalMailAssistantMessages({ ...input, mode: "reply" }),
    response_format: { type: "json_schema", json_schema: { name: "internal_mail_auto_reply", strict: true, schema: { type: "object", properties: { replies: { type: "array", items: { type: "string" }, maxItems: 3 }, correctedText: { type: "string" }, notes: { type: "array", items: { type: "string" }, maxItems: 3 } }, required: ["replies", "correctedText", "notes"], additionalProperties: false } } },
  });
  let output: { replies?: string[] };
  try { output = JSON.parse(llmText(result.choices[0]?.message.content)); } catch { throw new Error("تعذر إنشاء الرد الذكي المنظم."); }
  const reply = cleanText(output.replies?.[0] || "", 4_000);
  if (!reply) throw new Error("لم ينتج المساعد رداً صالحاً.");
  return { reply, model: result.model };
}

/** تنفذ التفويض الصريح لصاحب صندوق البريد بعد وصول رسالة داخلية. لا ترسل أبداً خارج ركيزة أو من بريد مخفي/سري/مولّد آلياً. */
export async function processInternalMailAssistantActions(input: { messageId: number }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const source = (await db.select().from(internalMailMessages).where(eq(internalMailMessages.id, input.messageId)).limit(1))[0];
  if (!source || source.status !== "sent" || source.automationAction !== "none") return { processed: 0, skipped: 0 };
  const recipients = await db.select({ entry: internalMailEntries, preferences: internalMailPreferences })
    .from(internalMailEntries)
    .innerJoin(internalMailPreferences, eq(internalMailPreferences.profileId, internalMailEntries.profileId))
    .where(and(eq(internalMailEntries.messageId, source.id), inArray(internalMailEntries.recipientType, ["to", "cc"] as const), ne(internalMailPreferences.assistantMode, "off")));
  let processed = 0;
  let skipped = 0;
  for (const recipient of recipients.slice(0, 8)) {
    const config = recipient.preferences;
    if (!canProcessInternalMailAssistantAction({ automationAction: source.automationAction, recipientType: recipient.entry.recipientType, sourceSenderProfileId: source.senderProfileId, recipientProfileId: recipient.entry.profileId, entryCategory: recipient.entry.category, sourceSubject: source.subject, subjectContains: config.assistantSubjectContains })) { skipped++; continue; }
    const existingAction = (await db.select({ id: internalMailAssistantActions.id }).from(internalMailAssistantActions).where(and(eq(internalMailAssistantActions.sourceMessageId, source.id), eq(internalMailAssistantActions.profileId, recipient.entry.profileId))).limit(1))[0];
    if (existingAction) { skipped++; continue; }
    const mode = config.assistantMode === "draft" ? "draft" : config.assistantMode === "auto_forward" ? "forward" : "reply";
    const actionResult = await db.insert(internalMailAssistantActions).values({ sourceMessageId: source.id, profileId: recipient.entry.profileId, mode, forwardProfileId: mode === "forward" ? config.assistantForwardProfileId : null, status: "pending" });
    const actionId = Number(actionResult[0].insertId);
    try {
      const signature = internalMailSignature(config);
      const threadId = source.threadId ?? source.id;
      let subject = source.subject;
      let body = "";
      let bodyHtml = "";
      let targetProfileId: number | null = null;
      if (mode === "forward") {
        if (!config.assistantForwardProfileId) throw new Error("لا يوجد مستلم تحويل مفوض.");
        targetProfileId = config.assistantForwardProfileId;
        subject = `إعادة توجيه: ${source.subject}`.slice(0, 255);
        body = cleanText(`تمت إعادة توجيه الرسالة داخلياً بناءً على التفويض.\n\n--- الرسالة الأصلية ---\n${source.body}${signature.body}`, 50_000);
        bodyHtml = sanitizeInternalMailHtml(`<p>تمت إعادة توجيه الرسالة داخلياً بناءً على التفويض.</p><blockquote>${source.bodyHtml || internalMailPlainTextToHtml(source.body)}</blockquote>${signature.bodyHtml}`);
      } else {
        const generated = await generateInternalMailAutoReply({ subject: source.subject, body: cleanText(source.body || richTextToPlainText(source.bodyHtml || ""), 12_000) });
        targetProfileId = source.senderProfileId;
        subject = `رد: ${source.subject}`.slice(0, 255);
        body = cleanText(`${generated.reply}${signature.body}`, 50_000);
        bodyHtml = sanitizeInternalMailHtml(`<p>${internalMailPlainTextToHtml(generated.reply)}</p>${signature.bodyHtml}`);
      }
      if (!targetProfileId || targetProfileId === recipient.entry.profileId) throw new Error("مستلم الإجراء الذكي غير صالح.");
      await assertRecipientsAreActive(db, [targetProfileId]);
      const created = await db.insert(internalMailMessages).values({ senderProfileId: recipient.entry.profileId, threadId, parentMessageId: source.id, subject, body, bodyHtml, automationAction: mode, importance: source.importance, status: mode === "draft" ? "draft" : "sent", sentAt: mode === "draft" ? null : new Date() });
      const generatedMessageId = Number(created[0].insertId);
      await db.insert(internalMailEntries).values([{ messageId: generatedMessageId, profileId: recipient.entry.profileId, recipientType: "sender", isRead: true, readAt: new Date() }, { messageId: generatedMessageId, profileId: targetProfileId, recipientType: "to" }]);
      await db.update(internalMailAssistantActions).set({ status: "processed", generatedMessageId, processedAt: new Date() }).where(eq(internalMailAssistantActions.id, actionId));
      if (config.assistantUpdatedByUserId) await logAudit({ actorUserId: config.assistantUpdatedByUserId, action: `internal_mail.assistant.${mode}.created`, entityType: "internal_mail_message", entityId: generatedMessageId, metadata: { sourceMessageId: source.id, mode, automatic: mode !== "draft" } });
      processed++;
    } catch (error) {
      await db.update(internalMailAssistantActions).set({ status: "failed", errorCode: error instanceof Error ? error.message.slice(0, 120) : "unknown", processedAt: new Date() }).where(eq(internalMailAssistantActions.id, actionId));
      if (config.assistantUpdatedByUserId) await logAudit({ actorUserId: config.assistantUpdatedByUserId, action: "internal_mail.assistant.failed", entityType: "internal_mail_message", entityId: source.id, metadata: { mode, reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" } });
    }
  }
  return { processed, skipped };
}

export async function scheduleInternalMail(input: { userId: number; messageId: number; scheduledAt: Date }) {
  const { db, profile } = await getMailActor(input.userId);
  if (input.scheduledAt.getTime() < Date.now() + 60_000) throw new Error("اختر موعد إرسال بعد دقيقة واحدة على الأقل.");
  const message = (await db.select().from(internalMailMessages).where(eq(internalMailMessages.id, input.messageId)).limit(1))[0];
  if (!message || message.senderProfileId !== profile.id || message.status !== "draft") throw new Error("هذه المسودة غير متاحة للجدولة.");
  const recipients = await db.select({ id: internalMailEntries.id }).from(internalMailEntries).where(and(eq(internalMailEntries.messageId, message.id), ne(internalMailEntries.recipientType, "sender"))).limit(1);
  if (!recipients.length) throw new Error("أضف مستلماً واحداً على الأقل قبل جدولة الإرسال.");
  await db.update(internalMailMessages).set({ status: "scheduled", scheduledAt: input.scheduledAt, updatedAt: new Date() }).where(eq(internalMailMessages.id, message.id));
  await logAudit({ actorUserId: input.userId, action: "internal_mail.scheduled", entityType: "internal_mail_message", entityId: message.id, metadata: { scheduledAt: input.scheduledAt.toISOString() } });
  return { messageId: message.id, scheduledAt: input.scheduledAt };
}

function startOfUtcDay(value: Date) { return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()); }
function addUtcDays(value: Date, days: number) { const next = new Date(value); next.setUTCDate(next.getUTCDate() + days); return next; }
function weekStartUtc(value: Date) { const start = new Date(startOfUtcDay(value)); start.setUTCDate(start.getUTCDate() - start.getUTCDay()); return start; }
function dateAtSourceTime(year: number, month: number, day: number, source: Date) { return new Date(Date.UTC(year, month, day, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds())); }

export function normalizeInternalMailRecurringRule(input: InternalMailRecurringRule) {
  const intervalCount = Math.floor(input.intervalCount);
  if (!Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 365) throw new Error("يجب أن يكون فاصل التكرار عدداً صحيحاً بين 1 و365.");
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) throw new Error("اختر وقت بداية صحيحاً للتكرار.");
  if (input.endsAt && (!(input.endsAt instanceof Date) || Number.isNaN(input.endsAt.getTime()) || input.endsAt <= input.startsAt)) throw new Error("يجب أن يكون تاريخ انتهاء التكرار بعد وقت البداية.");
  const weekdays = input.frequency === "weekly" ? Array.from(new Set((input.weekdays ?? []).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))).sort((a, b) => a - b) : [];
  if (input.frequency === "weekly" && !weekdays.length) throw new Error("اختر يوماً واحداً على الأقل للتكرار الأسبوعي.");
  const monthDay = input.frequency === "monthly" ? Math.floor(input.monthDay ?? input.startsAt.getUTCDate()) : null;
  if (input.frequency === "monthly" && (monthDay == null || !Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) throw new Error("اختر يوماً شهرياً بين 1 و31.");
  return { frequency: input.frequency, intervalCount, weekdays, monthDay, startsAt: input.startsAt, endsAt: input.endsAt ?? null };
}

/** يحسب الموعد التالي بصورة حتمية ومن دون الاعتماد على مؤقت داخل العملية. */
export function nextInternalMailRecurringRun(input: InternalMailRecurringRule & { after?: Date }) {
  const rule = normalizeInternalMailRecurringRule({ ...input, startsAt: input.startsAt, endsAt: input.endsAt ?? null });
  const after = input.after ?? new Date(rule.startsAt.getTime() - 1);
  const candidateAfter = Math.max(after.getTime(), rule.startsAt.getTime() - 1);
  let next: Date | null = null;
  if (rule.frequency === "daily") {
    const wholeDays = Math.max(0, Math.floor((startOfUtcDay(new Date(candidateAfter)) - startOfUtcDay(rule.startsAt)) / 86_400_000));
    let offset = Math.floor(wholeDays / rule.intervalCount) * rule.intervalCount;
    for (let attempt = 0; attempt < 3_660; attempt++, offset += rule.intervalCount) {
      const candidate = addUtcDays(rule.startsAt, offset);
      if (candidate.getTime() > candidateAfter) { next = candidate; break; }
    }
  } else if (rule.frequency === "weekly") {
    const startWeek = weekStartUtc(rule.startsAt).getTime();
    const earliestDay = Math.max(startOfUtcDay(rule.startsAt), startOfUtcDay(new Date(candidateAfter)) - 86_400_000);
    for (let offset = 0; offset < 3_660; offset++) {
      const day = new Date(earliestDay + offset * 86_400_000);
      if (!rule.weekdays.includes(day.getUTCDay())) continue;
      const weekDifference = Math.floor((weekStartUtc(day).getTime() - startWeek) / (7 * 86_400_000));
      if (weekDifference < 0 || weekDifference % rule.intervalCount !== 0) continue;
      const candidate = dateAtSourceTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), rule.startsAt);
      if (candidate >= rule.startsAt && candidate.getTime() > candidateAfter) { next = candidate; break; }
    }
  } else {
    const startMonth = rule.startsAt.getUTCFullYear() * 12 + rule.startsAt.getUTCMonth();
    const afterDate = new Date(candidateAfter);
    const afterMonth = afterDate.getUTCFullYear() * 12 + afterDate.getUTCMonth();
    for (let offset = Math.max(0, afterMonth - startMonth); offset < 1_200; offset++) {
      if (offset % rule.intervalCount !== 0) continue;
      const absoluteMonth = startMonth + offset;
      const year = Math.floor(absoluteMonth / 12); const month = absoluteMonth % 12;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const candidate = dateAtSourceTime(year, month, Math.min(rule.monthDay ?? rule.startsAt.getUTCDate(), lastDay), rule.startsAt);
      if (candidate >= rule.startsAt && candidate.getTime() > candidateAfter) { next = candidate; break; }
    }
  }
  if (!next || (rule.endsAt && next > rule.endsAt)) return null;
  return next;
}

export async function scheduleRecurringInternalMail(input: { userId: number; messageId: number; rule: InternalMailRecurringRule }) {
  const { db, profile } = await getMailActor(input.userId);
  const message = (await db.select().from(internalMailMessages).where(eq(internalMailMessages.id, input.messageId)).limit(1))[0];
  if (!message || message.senderProfileId !== profile.id || message.status !== "draft") throw new Error("هذه المسودة غير متاحة للجدولة المتكررة.");
  const recipients = await db.select({ id: internalMailEntries.id }).from(internalMailEntries).where(and(eq(internalMailEntries.messageId, message.id), ne(internalMailEntries.recipientType, "sender"))).limit(1);
  if (!recipients.length) throw new Error("أضف مستلماً واحداً على الأقل قبل جدولة الإرسال المتكرر.");
  const rule = normalizeInternalMailRecurringRule(input.rule);
  if (rule.startsAt.getTime() < Date.now() + 60_000) throw new Error("اختر وقت بداية بعد دقيقة واحدة على الأقل.");
  const nextRunAt = nextInternalMailRecurringRun(rule);
  if (!nextRunAt) throw new Error("لا يوجد موعد إرسال ضمن نطاق تاريخ الانتهاء المحدد.");
  const values = { sourceMessageId: message.id, senderProfileId: profile.id, frequency: rule.frequency, intervalCount: rule.intervalCount, weekdays: rule.weekdays.length ? rule.weekdays.join(",") : null, monthDay: rule.monthDay, startsAt: rule.startsAt, endsAt: rule.endsAt, nextRunAt, lastRunAt: null, status: "active" as const, updatedAt: new Date() };
  const existing = (await db.select().from(internalMailRecurringSchedules).where(eq(internalMailRecurringSchedules.sourceMessageId, message.id)).limit(1))[0];
  if (existing) await db.update(internalMailRecurringSchedules).set(values).where(eq(internalMailRecurringSchedules.id, existing.id));
  else await db.insert(internalMailRecurringSchedules).values(values);
  const schedule = (await db.select().from(internalMailRecurringSchedules).where(eq(internalMailRecurringSchedules.sourceMessageId, message.id)).limit(1))[0]!;
  await logAudit({ actorUserId: input.userId, action: "internal_mail.recurring_scheduled", entityType: "internal_mail_message", entityId: message.id, metadata: { scheduleId: schedule.id, frequency: rule.frequency, intervalCount: rule.intervalCount, weekdays: rule.weekdays, monthDay: rule.monthDay, startsAt: rule.startsAt.toISOString(), endsAt: rule.endsAt?.toISOString() ?? null } });
  return { scheduleId: schedule.id, nextRunAt: schedule.nextRunAt, status: schedule.status };
}

export async function listInternalMailRecurringSchedules(input: { userId: number }) {
  const { db, profile } = await getMailActor(input.userId);
  const schedules = await db.select().from(internalMailRecurringSchedules).where(eq(internalMailRecurringSchedules.senderProfileId, profile.id)).orderBy(desc(internalMailRecurringSchedules.updatedAt)).limit(50);
  if (!schedules.length) return [];
  const sources = await db.select({ id: internalMailMessages.id, subject: internalMailMessages.subject, importance: internalMailMessages.importance }).from(internalMailMessages).where(inArray(internalMailMessages.id, schedules.map(item => item.sourceMessageId)));
  const byId = new Map(sources.map(source => [source.id, source]));
  return schedules.map(schedule => ({ ...schedule, source: byId.get(schedule.sourceMessageId) || null, weekdays: schedule.weekdays ? schedule.weekdays.split(",").map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [] }));
}

export async function updateInternalMailRecurringSchedule(input: { userId: number; scheduleId: number; action: "pause" | "resume" | "cancel" }) {
  const { db, profile } = await getMailActor(input.userId);
  const schedule = (await db.select().from(internalMailRecurringSchedules).where(and(eq(internalMailRecurringSchedules.id, input.scheduleId), eq(internalMailRecurringSchedules.senderProfileId, profile.id))).limit(1))[0];
  if (!schedule) throw new Error("الجدولة المتكررة غير متاحة لهذا البريد.");
  if (input.action === "cancel") {
    await db.update(internalMailRecurringSchedules).set({ status: "cancelled", updatedAt: new Date() }).where(eq(internalMailRecurringSchedules.id, schedule.id));
  } else if (input.action === "pause") {
    if (schedule.status === "cancelled") throw new Error("لا يمكن إيقاف جدولة ملغاة.");
    await db.update(internalMailRecurringSchedules).set({ status: "paused", updatedAt: new Date() }).where(eq(internalMailRecurringSchedules.id, schedule.id));
  } else {
    if (schedule.status === "cancelled") throw new Error("الجدولة الملغاة لا تستأنف؛ أنشئ جدولة جديدة من المسودة.");
    const nextRunAt = nextInternalMailRecurringRun({ frequency: schedule.frequency, intervalCount: schedule.intervalCount, weekdays: schedule.weekdays ? schedule.weekdays.split(",").map(Number) : [], monthDay: schedule.monthDay, startsAt: schedule.startsAt, endsAt: schedule.endsAt, after: new Date() });
    if (!nextRunAt) throw new Error("انتهت فترة هذه الجدولة ولا يمكن استئنافها.");
    await db.update(internalMailRecurringSchedules).set({ status: "active", nextRunAt, updatedAt: new Date() }).where(eq(internalMailRecurringSchedules.id, schedule.id));
  }
  await logAudit({ actorUserId: input.userId, action: `internal_mail.recurring_${input.action}`, entityType: "internal_mail_recurring_schedule", entityId: schedule.id });
  return { success: true };
}

async function deliverRecurringInternalMail(input: { schedule: typeof internalMailRecurringSchedules.$inferSelect; scheduledFor: Date }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const schedule = input.schedule;
  await db.insert(internalMailRecurringScheduleRuns).values({ scheduleId: schedule.id, scheduledFor: input.scheduledFor, status: "pending" }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  const run = (await db.select().from(internalMailRecurringScheduleRuns).where(and(eq(internalMailRecurringScheduleRuns.scheduleId, schedule.id), eq(internalMailRecurringScheduleRuns.scheduledFor, input.scheduledFor))).limit(1))[0]!;
  const runId = run.id;
  if (run.status === "sent" && run.sentMessageId) return { sentMessageId: run.sentMessageId, alreadySent: true };
  const source = (await db.select().from(internalMailMessages).where(and(eq(internalMailMessages.id, schedule.sourceMessageId), eq(internalMailMessages.senderProfileId, schedule.senderProfileId), eq(internalMailMessages.status, "draft"))).limit(1))[0];
  if (!source) throw new Error("المسودة المصدر غير متاحة أو لم تعد قابلة للجدولة.");
  const entries = await db.select().from(internalMailEntries).where(eq(internalMailEntries.messageId, source.id));
  const recipients = entries.filter(entry => entry.recipientType !== "sender");
  if (!recipients.length) throw new Error("لا توجد جهات داخلية مستلمة في المسودة المصدر.");
  await assertRecipientsAreActive(db, recipients.map(entry => entry.profileId));
  const attachments = await db.select().from(internalMailAttachments).where(eq(internalMailAttachments.messageId, source.id));
  const sentAt = new Date();
  const created = await db.insert(internalMailMessages).values({ senderProfileId: source.senderProfileId, threadId: source.threadId ?? source.id, parentMessageId: source.parentMessageId, subject: source.subject, body: source.body, bodyHtml: source.bodyHtml, automationAction: source.automationAction, importance: source.importance, status: "sent", recurringScheduleRunId: runId, sentAt, updatedAt: sentAt });
  const messageId = Number(created[0].insertId);
  await db.insert(internalMailEntries).values(entries.map(entry => ({ messageId, profileId: entry.profileId, recipientType: entry.recipientType, isRead: entry.recipientType === "sender", readAt: entry.recipientType === "sender" ? sentAt : null, category: entry.category, archivedAt: null, trashedAt: null })));
  if (attachments.length) await db.insert(internalMailAttachments).values(attachments.map(attachment => ({ messageId, originalName: attachment.originalName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, storageKey: attachment.storageKey, storageUrl: attachment.storageUrl, uploadedByProfileId: schedule.senderProfileId })));
  await db.update(internalMailRecurringScheduleRuns).set({ status: "sent", sentMessageId: messageId, failureReason: null, updatedAt: sentAt }).where(eq(internalMailRecurringScheduleRuns.id, runId));
  await applyInternalMailRules({ db, messageId, senderProfileId: source.senderProfileId, subject: source.subject });
  await recordInternalMailContacts({ db, profileId: source.senderProfileId, messageId });
  try { await processInternalMailAssistantActions({ messageId }); } catch { /* لا تمنع إخفاقات المساعد إرسال نسخة بريدية فوضها المستخدم. */ }
  return { sentMessageId: messageId, alreadySent: false };
}

export async function dispatchRecurringInternalMail() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const now = new Date();
  const due = await db.select().from(internalMailRecurringSchedules).where(and(eq(internalMailRecurringSchedules.status, "active"), lte(internalMailRecurringSchedules.nextRunAt, now))).orderBy(asc(internalMailRecurringSchedules.nextRunAt)).limit(25);
  let sent = 0; let paused = 0;
  for (const schedule of due) {
    try {
      if (schedule.endsAt && schedule.nextRunAt > schedule.endsAt) { await db.update(internalMailRecurringSchedules).set({ status: "cancelled", updatedAt: now }).where(eq(internalMailRecurringSchedules.id, schedule.id)); continue; }
      const result = await deliverRecurringInternalMail({ schedule, scheduledFor: schedule.nextRunAt });
      if (!result.alreadySent) sent++;
      const nextRunAt = nextInternalMailRecurringRun({ frequency: schedule.frequency, intervalCount: schedule.intervalCount, weekdays: schedule.weekdays ? schedule.weekdays.split(",").map(Number) : [], monthDay: schedule.monthDay, startsAt: schedule.startsAt, endsAt: schedule.endsAt, after: schedule.nextRunAt });
      await db.update(internalMailRecurringSchedules).set({ status: nextRunAt ? "active" : "cancelled", nextRunAt: nextRunAt ?? schedule.nextRunAt, lastRunAt: schedule.nextRunAt, updatedAt: now }).where(and(eq(internalMailRecurringSchedules.id, schedule.id), eq(internalMailRecurringSchedules.status, "active")));
      await logAudit({ actorUserId: schedule.senderProfileId, action: "internal_mail.recurring_sent", entityType: "internal_mail_recurring_schedule", entityId: schedule.id, metadata: { messageId: result.sentMessageId, scheduledFor: schedule.nextRunAt.toISOString() } });
    } catch (error) {
      await db.update(internalMailRecurringSchedules).set({ status: "paused", updatedAt: now }).where(eq(internalMailRecurringSchedules.id, schedule.id));
      await logAudit({ actorUserId: schedule.senderProfileId, action: "internal_mail.recurring_paused", entityType: "internal_mail_recurring_schedule", entityId: schedule.id, metadata: { reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" } });
      paused++;
    }
  }
  return { sent, paused, considered: due.length };
}

export async function dispatchScheduledInternalMail() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const due = await db.select().from(internalMailMessages).where(and(eq(internalMailMessages.status, "scheduled"), lte(internalMailMessages.scheduledAt, new Date()))).limit(100);
  let sent = 0;
  for (const message of due) {
    const sentAt = new Date();
    const result = await db.update(internalMailMessages).set({ status: "sent", sentAt, scheduledAt: null, threadId: message.threadId ?? message.id, updatedAt: sentAt }).where(and(eq(internalMailMessages.id, message.id), eq(internalMailMessages.status, "scheduled")));
    if (!Number(result[0]?.affectedRows)) continue;
    await applyInternalMailRules({ db, messageId: message.id, senderProfileId: message.senderProfileId, subject: message.subject });
    await recordInternalMailContacts({ db, profileId: message.senderProfileId, messageId: message.id });
    try { await processInternalMailAssistantActions({ messageId: message.id }); } catch { /* لا تمنع إخفاقات المساعد إرسال البريد المجدول الأصلي. */ }
    await logAudit({ actorUserId: message.senderProfileId, action: "internal_mail.scheduled_sent", entityType: "internal_mail_message", entityId: message.id, metadata: { scheduledAt: message.scheduledAt?.toISOString() } });
    sent++;
  }
  return { sent };
}

export async function getInternalMailPreferences(userId: number) {
  const { db, profile } = await getMailActor(userId);
  const settings = (await db.select().from(internalMailPreferences).where(eq(internalMailPreferences.profileId, profile.id)).limit(1))[0];
  const contacts = await db.select({ id: internalMailContacts.id, contactProfileId: internalMailContacts.contactProfileId, isFavorite: internalMailContacts.isFavorite, lastUsedAt: internalMailContacts.lastUsedAt, fullName: personProfiles.fullName, email: personProfiles.email, jobTitle: personProfiles.jobTitle }).from(internalMailContacts).innerJoin(personProfiles, eq(personProfiles.id, internalMailContacts.contactProfileId)).where(eq(internalMailContacts.profileId, profile.id)).orderBy(desc(internalMailContacts.isFavorite), desc(internalMailContacts.lastUsedAt)).limit(30);
  const rules = await db.select().from(internalMailRules).where(eq(internalMailRules.profileId, profile.id)).orderBy(desc(internalMailRules.updatedAt)).limit(30);
  const templates = await db.select().from(internalMailTemplates).where(eq(internalMailTemplates.profileId, profile.id)).orderBy(desc(internalMailTemplates.updatedAt)).limit(30);
  return {
    signature: settings?.signature || "",
    signatureImageUrl: settings?.signatureImageStorageUrl || null,
    assistant: {
      mode: settings?.assistantMode || "off",
      replyTone: settings?.assistantReplyTone || "formal",
      forwardProfileId: settings?.assistantForwardProfileId || null,
      subjectContains: settings?.assistantSubjectContains || "",
      enabledAt: settings?.assistantEnabledAt || null,
    },
    contacts,
    rules,
    templates,
  };
}

export async function saveInternalMailTemplate(input: { userId: number; id?: number; name: string; subject: string; body: string; bodyHtml?: string | null }) {
  const { db, profile } = await getMailActor(input.userId);
  const name = cleanText(input.name, 160); const subject = cleanText(input.subject, 255); const bodyHtml = input.bodyHtml ? sanitizeInternalMailHtml(input.bodyHtml) : null; const body = cleanText(input.body || (bodyHtml ? richTextToPlainText(bodyHtml) : ""), 50_000);
  if (!name || !subject || !body) throw new Error("أدخل اسم القالب وموضوعه ومحتواه.");
  if (input.id) { const existing = (await db.select().from(internalMailTemplates).where(and(eq(internalMailTemplates.id, input.id), eq(internalMailTemplates.profileId, profile.id))).limit(1))[0]; if (!existing) throw new Error("قالب البريد غير متاح."); await db.update(internalMailTemplates).set({ name, subject, body, bodyHtml }).where(eq(internalMailTemplates.id, existing.id)); return { id: existing.id }; }
  const result = await db.insert(internalMailTemplates).values({ profileId: profile.id, name, subject, body, bodyHtml });
  return { id: Number(result[0].insertId) };
}

export async function deleteInternalMailTemplate(input: { userId: number; id: number }) {
  const { db, profile } = await getMailActor(input.userId);
  await db.delete(internalMailTemplates).where(and(eq(internalMailTemplates.id, input.id), eq(internalMailTemplates.profileId, profile.id)));
  return { success: true };
}

export async function updateInternalMailPreferences(input: { userId: number; signature: string }) {
  const { db, profile } = await getMailActor(input.userId); const signature = cleanText(input.signature, 3_000); const existing = (await db.select().from(internalMailPreferences).where(eq(internalMailPreferences.profileId, profile.id)).limit(1))[0];
  if (existing) await db.update(internalMailPreferences).set({ signature }).where(eq(internalMailPreferences.id, existing.id)); else await db.insert(internalMailPreferences).values({ profileId: profile.id, signature });
  await logAudit({ actorUserId: input.userId, action: "internal_mail.signature.updated", entityType: "person_profile", entityId: profile.id }); return { signature };
}

export async function uploadInternalMailSignatureImage(input: { userId: number; image: SignatureImageInput }) {
  const { db, profile } = await getMailActor(input.userId);
  const bytes = Buffer.from(input.image.contentBase64, "base64");
  if (!bytes.byteLength || bytes.byteLength > 2_000_000) throw new Error("اختر صورة توقيع بحجم لا يتجاوز 2 ميجابايت.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(input.image.mimeType)) throw new Error("يدعم توقيع البريد صور PNG وJPEG وWebP فقط.");
  const safeName = input.image.originalName.replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "_").slice(0, 120) || "signature-image";
  const stored = await storagePut(`internal-mail-signatures/${profile.id}/${Date.now()}-${safeName}`, bytes, input.image.mimeType);
  const existing = (await db.select().from(internalMailPreferences).where(eq(internalMailPreferences.profileId, profile.id)).limit(1))[0];
  if (existing) await db.update(internalMailPreferences).set({ signatureImageStorageKey: stored.key, signatureImageStorageUrl: stored.url }).where(eq(internalMailPreferences.id, existing.id));
  else await db.insert(internalMailPreferences).values({ profileId: profile.id, signatureImageStorageKey: stored.key, signatureImageStorageUrl: stored.url });
  await logAudit({ actorUserId: input.userId, action: "internal_mail.signature_image.updated", entityType: "person_profile", entityId: profile.id, metadata: { mimeType: input.image.mimeType, sizeBytes: bytes.byteLength } });
  return { url: stored.url };
}

export async function updateInternalMailAssistantPreferences(input: { userId: number; mode: InternalMailAssistantMode; replyTone?: "formal" | "concise"; forwardProfileId?: number | null; subjectContains?: string | null; authorizationConfirmed?: boolean }) {
  const { db, profile } = await getMailActor(input.userId);
  const forwardProfileId = input.mode === "auto_forward" ? input.forwardProfileId ?? null : null;
  const subjectContains = cleanText(input.subjectContains || "", 160) || null;
  if (input.mode === "auto_forward" && !forwardProfileId) throw new Error("حدد مستلم التحويل الداخلي التلقائي.");
  if (forwardProfileId === profile.id) throw new Error("لا يمكن تحويل البريد تلقائياً إلى الحساب نفسه.");
  if (forwardProfileId) await assertRecipientsAreActive(db, [forwardProfileId]);
  if (["auto_reply", "auto_forward"].includes(input.mode) && !input.authorizationConfirmed) throw new Error("يلزم تأكيد التفويض قبل تفعيل الإرسال أو التحويل التلقائي.");
  const existing = (await db.select().from(internalMailPreferences).where(eq(internalMailPreferences.profileId, profile.id)).limit(1))[0];
  const replyTone = input.replyTone ?? existing?.assistantReplyTone ?? "formal";
  const patch = { assistantMode: input.mode, assistantReplyTone: replyTone, assistantForwardProfileId: forwardProfileId, assistantSubjectContains: subjectContains, assistantEnabledAt: input.mode === "off" ? null : new Date(), assistantUpdatedByUserId: input.userId };
  if (existing) await db.update(internalMailPreferences).set(patch).where(eq(internalMailPreferences.id, existing.id));
  else await db.insert(internalMailPreferences).values({ profileId: profile.id, ...patch });
  await logAudit({ actorUserId: input.userId, action: "internal_mail.assistant_delegation.updated", entityType: "person_profile", entityId: profile.id, metadata: { mode: input.mode, forwardProfileId, hasSubjectFilter: Boolean(subjectContains), explicitAuthorization: Boolean(input.authorizationConfirmed) } });
  return { mode: input.mode, replyTone, forwardProfileId, subjectContains };
}

export async function updateInternalMailContact(input: { userId: number; contactProfileId: number; isFavorite: boolean }) {
  const { db, profile } = await getMailActor(input.userId); if (input.contactProfileId === profile.id) throw new Error("لا يمكن إضافة الحساب الحالي إلى جهات الاتصال."); await assertRecipientsAreActive(db, [input.contactProfileId]);
  const existing = (await db.select().from(internalMailContacts).where(and(eq(internalMailContacts.profileId, profile.id), eq(internalMailContacts.contactProfileId, input.contactProfileId))).limit(1))[0]; if (existing) await db.update(internalMailContacts).set({ isFavorite: input.isFavorite }).where(eq(internalMailContacts.id, existing.id)); else await db.insert(internalMailContacts).values({ profileId: profile.id, contactProfileId: input.contactProfileId, isFavorite: input.isFavorite }); return { success: true };
}

export async function saveInternalMailRule(input: { userId: number; id?: number; name: string; subjectContains?: string | null; senderContains?: string | null; action: "star" | "archive" | "category"; category?: string | null; isEnabled: boolean }) {
  const { db, profile } = await getMailActor(input.userId); const payload = { name: cleanText(input.name, 160), subjectContains: input.subjectContains ? cleanText(input.subjectContains, 160) : null, senderContains: input.senderContains ? cleanText(input.senderContains, 160) : null, action: input.action, category: input.action === "category" ? cleanText(input.category || "", 80) || null : null, isEnabled: input.isEnabled };
  if (!payload.name || (!payload.subjectContains && !payload.senderContains)) throw new Error("أدخل اسماً وقيداً واحداً على الأقل للقاعدة."); if (input.action === "category" && !payload.category) throw new Error("اختر علامة للقاعدة.");
  if (input.id) { const existing = (await db.select().from(internalMailRules).where(and(eq(internalMailRules.id, input.id), eq(internalMailRules.profileId, profile.id))).limit(1))[0]; if (!existing) throw new Error("قاعدة البريد غير متاحة."); await db.update(internalMailRules).set(payload).where(eq(internalMailRules.id, existing.id)); return { id: existing.id }; }
  const result = await db.insert(internalMailRules).values({ profileId: profile.id, ...payload }); return { id: Number(result[0].insertId) };
}

export async function deleteInternalMailRule(input: { userId: number; id: number }) { const { db, profile } = await getMailActor(input.userId); await db.delete(internalMailRules).where(and(eq(internalMailRules.id, input.id), eq(internalMailRules.profileId, profile.id))); return { success: true }; }

function folderConditions(profileId: number, folder: InternalMailFolder) {
  const base = [eq(internalMailEntries.profileId, profileId)];
  if (folder === "inbox") return [...base, ne(internalMailEntries.recipientType, "sender"), eq(internalMailMessages.status, "sent"), isNull(internalMailEntries.archivedAt), isNull(internalMailEntries.trashedAt)];
  if (folder === "sent") return [...base, eq(internalMailEntries.recipientType, "sender"), eq(internalMailMessages.status, "sent"), isNull(internalMailEntries.trashedAt)];
  if (folder === "drafts") return [...base, eq(internalMailEntries.recipientType, "sender"), eq(internalMailMessages.status, "draft"), isNull(internalMailEntries.trashedAt)];
  if (folder === "starred") return [...base, eq(internalMailEntries.isStarred, true), isNull(internalMailEntries.trashedAt)];
  if (folder === "archive") return [...base, isNull(internalMailEntries.trashedAt), sql`${internalMailEntries.archivedAt} IS NOT NULL`];
  return [...base, sql`${internalMailEntries.trashedAt} IS NOT NULL`];
}

export async function listInternalMail(input: { userId: number; folder: InternalMailFolder; search?: string; sender?: string; subject?: string; category?: string; fromDate?: Date; toDate?: Date; sortBy?: "date" | "sender" | "subject" | "importance"; sortDir?: "asc" | "desc" }) {
  const { db, profile } = await getMailActor(input.userId);
  const search = input.search?.trim().slice(0, 120);
  const sender = input.sender?.trim().slice(0, 120);
  const subject = input.subject?.trim().slice(0, 120);
  const conditions = folderConditions(profile.id, input.folder);
  if (input.category) conditions.push(eq(internalMailEntries.category, input.category.trim().slice(0, 80)));
  if (search) conditions.push(or(like(internalMailMessages.subject, `%${search}%`), like(internalMailMessages.body, `%${search}%`), like(personProfiles.fullName, `%${search}%`))!);
  if (sender) conditions.push(like(personProfiles.fullName, `%${sender}%`));
  if (subject) conditions.push(like(internalMailMessages.subject, `%${subject}%`));
  if (input.fromDate) conditions.push(gte(internalMailMessages.updatedAt, input.fromDate));
  if (input.toDate) conditions.push(lte(internalMailMessages.updatedAt, input.toDate));
  const dir = input.sortDir === "asc" ? asc : desc;
  const orderByColumns = input.sortBy === "sender"
    ? [dir(personProfiles.fullName), desc(internalMailMessages.sentAt), desc(internalMailMessages.id)]
    : input.sortBy === "subject"
      ? [dir(internalMailMessages.subject), desc(internalMailMessages.sentAt), desc(internalMailMessages.id)]
      : input.sortBy === "importance"
        ? [desc(internalMailMessages.importance), desc(internalMailMessages.sentAt), desc(internalMailMessages.id)]
        : [dir(internalMailMessages.sentAt), dir(internalMailMessages.updatedAt), dir(internalMailMessages.id)];
  const rows = await db.select({ entry: internalMailEntries, message: internalMailMessages, senderName: personProfiles.fullName, senderJobTitle: personProfiles.jobTitle, attachmentCount: sql<number>`(SELECT COUNT(*) FROM internal_mail_attachments a WHERE a.messageId = ${internalMailMessages.id})` })
    .from(internalMailEntries)
    .innerJoin(internalMailMessages, eq(internalMailMessages.id, internalMailEntries.messageId))
    .innerJoin(personProfiles, eq(personProfiles.id, internalMailMessages.senderProfileId))
    .where(and(...conditions)).orderBy(...orderByColumns).limit(120);
  return rows;
}

export async function getInternalMailMessage(input: { userId: number; messageId: number }) {
  const { db, profile } = await getMailActor(input.userId);
  const entry = (await db.select({ entry: internalMailEntries, message: internalMailMessages, senderName: personProfiles.fullName, senderEmail: personProfiles.email, senderJobTitle: personProfiles.jobTitle }).from(internalMailEntries).innerJoin(internalMailMessages, eq(internalMailMessages.id, internalMailEntries.messageId)).innerJoin(personProfiles, eq(personProfiles.id, internalMailMessages.senderProfileId)).where(and(eq(internalMailEntries.messageId, input.messageId), eq(internalMailEntries.profileId, profile.id))).limit(1))[0];
  if (!entry) throw new Error("لا تملك صلاحية فتح هذه الرسالة.");
  if (!entry.entry.isRead && entry.entry.recipientType !== "sender") await db.update(internalMailEntries).set({ isRead: true, readAt: new Date() }).where(eq(internalMailEntries.id, entry.entry.id));
  const visibleTypes = entry.entry.recipientType === "sender" ? ["to", "cc", "bcc"] as const : ["to", "cc"] as const;
  const recipients = await db.select({ recipientType: internalMailEntries.recipientType, profileId: internalMailEntries.profileId, fullName: personProfiles.fullName, email: personProfiles.email }).from(internalMailEntries).innerJoin(personProfiles, eq(personProfiles.id, internalMailEntries.profileId)).where(and(eq(internalMailEntries.messageId, input.messageId), inArray(internalMailEntries.recipientType, visibleTypes)));
  const attachmentRows = await db.select().from(internalMailAttachments).where(eq(internalMailAttachments.messageId, input.messageId));
  const attachments = await Promise.all(attachmentRows.map(async attachment => ({ id: attachment.id, originalName: attachment.originalName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, url: await storageGetSignedUrl(attachment.storageKey) })));
  const threadId = entry.message.threadId ?? entry.message.id;
  const thread = await db.select({ message: internalMailMessages, entry: internalMailEntries, senderName: personProfiles.fullName, senderJobTitle: personProfiles.jobTitle })
    .from(internalMailEntries)
    .innerJoin(internalMailMessages, eq(internalMailMessages.id, internalMailEntries.messageId))
    .innerJoin(personProfiles, eq(personProfiles.id, internalMailMessages.senderProfileId))
    .where(and(eq(internalMailEntries.profileId, profile.id), eq(internalMailMessages.threadId, threadId)))
    .orderBy(asc(internalMailMessages.sentAt), asc(internalMailMessages.createdAt), asc(internalMailMessages.id));
  return { ...entry, recipients, attachments, thread };
}

export async function summarizeInternalMailMessage(input: { userId: number; messageId: number }) {
  const { db, profile } = await getMailActor(input.userId);
  const row = (await db.select({ message: internalMailMessages }).from(internalMailEntries).innerJoin(internalMailMessages, eq(internalMailMessages.id, internalMailEntries.messageId)).where(and(eq(internalMailEntries.messageId, input.messageId), eq(internalMailEntries.profileId, profile.id))).limit(1))[0];
  if (!row) throw new Error("لا تملك صلاحية تلخيص هذه الرسالة.");
  const sourceText = cleanText(row.message.body || richTextToPlainText(row.message.bodyHtml || ""), 50_000);
  if (!sourceText) throw new Error("لا يوجد نص صالح لتلخيص الرسالة.");
  const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 1_600, messages: buildInternalMailSummaryMessages(row.message.subject, sourceText) });
  const summary = cleanText(llmText(result.choices[0]?.message.content), 15_000);
  if (!summary) throw new Error("تعذر إنشاء ملخص للرسالة حالياً.");
  await logAudit({ actorUserId: input.userId, action: "internal_mail.summarized", entityType: "internal_mail_message", entityId: input.messageId, metadata: { sourceCharacters: sourceText.length, summaryCharacters: summary.length, model: result.model } });
  return { summary };
}

export async function suggestInternalMailAssistant(input: { userId: number; messageId: number; mode: "reply" | "proofread"; tone?: "formal" | "concise" }) {
  const detail = await getInternalMailMessage({ userId: input.userId, messageId: input.messageId });
  const source = cleanText(detail.message.body || richTextToPlainText(detail.message.bodyHtml || ""), 12_000);
  if (!source) throw new Error("لا يوجد نص صالح لإنشاء الاقتراحات.");
  const { db, profile } = await getMailActor(input.userId);
  const preferences = (await db.select({ replyTone: internalMailPreferences.assistantReplyTone }).from(internalMailPreferences).where(eq(internalMailPreferences.profileId, profile.id)).limit(1))[0];
  const tone = input.tone ?? preferences?.replyTone ?? "formal";
  const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 1_400, messages: buildInternalMailAssistantMessages({ subject: detail.message.subject, body: source, mode: input.mode, tone }), response_format: { type: "json_schema", json_schema: { name: "internal_mail_assistant", strict: true, schema: { type: "object", properties: { replies: { type: "array", items: { type: "string" }, maxItems: 3 }, correctedText: { type: "string" }, notes: { type: "array", items: { type: "string" }, maxItems: 3 } }, required: ["replies", "correctedText", "notes"], additionalProperties: false } } } });
  let output: { replies: string[]; correctedText: string; notes: string[] };
  try { output = JSON.parse(llmText(result.choices[0]?.message.content)); } catch { throw new Error("تعذر إنشاء اقتراحات منظمة حالياً."); }
  const safe = { replies: output.replies.map(item => cleanText(item, 4_000)).filter(Boolean).slice(0, 3), correctedText: cleanText(output.correctedText, 15_000), notes: output.notes.map(item => cleanText(item, 500)).filter(Boolean).slice(0, 3) };
  await logAudit({ actorUserId: input.userId, action: `internal_mail.ai_${input.mode}`, entityType: "internal_mail_message", entityId: input.messageId, metadata: { sourceCharacters: source.length, tone: input.mode === "reply" ? tone : undefined, model: result.model } });
  return safe;
}

export async function updateInternalMailEntry(input: { userId: number; messageId: number; action: "star" | "unstar" | "archive" | "restore" | "trash" | "category"; category?: string | null }) {
  const { db, profile } = await getMailActor(input.userId);
  const entry = (await db.select().from(internalMailEntries).where(and(eq(internalMailEntries.messageId, input.messageId), eq(internalMailEntries.profileId, profile.id))).limit(1))[0];
  if (!entry) throw new Error("لا تملك تعديل حالة هذه الرسالة.");
  const patch = input.action === "star" ? { isStarred: true } : input.action === "unstar" ? { isStarred: false } : input.action === "archive" ? { archivedAt: new Date(), trashedAt: null } : input.action === "restore" ? { archivedAt: null, trashedAt: null } : input.action === "trash" ? { trashedAt: new Date() } : { category: input.category?.trim().slice(0, 80) || null };
  await db.update(internalMailEntries).set(patch).where(eq(internalMailEntries.id, entry.id));
  await logAudit({ actorUserId: input.userId, action: `internal_mail.entry.${input.action}`, entityType: "internal_mail_message", entityId: input.messageId, metadata: input.action === "category" ? { category: patch.category } : undefined });
  return { success: true };
}

async function addInternalMailAttachment(input: { db: Awaited<ReturnType<typeof getDb>> & {}; messageId: number; profileId: number; attachment: MailAttachmentInput }) {
  const bytes = validateConversationAttachment(input.attachment);
  const safeName = input.attachment.originalName.replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "_").slice(0, 120) || "attachment";
  const stored = await storagePut(`internal-mail/${input.messageId}/${Date.now()}-${safeName}`, bytes, input.attachment.mimeType);
  await input.db.insert(internalMailAttachments).values({ messageId: input.messageId, originalName: input.attachment.originalName.slice(0, 255), mimeType: input.attachment.mimeType, sizeBytes: bytes.byteLength, storageKey: stored.key, storageUrl: stored.url, uploadedByProfileId: input.profileId });
}

export async function getInternalMailFolderCounts(userId: number) {
  const { db, profile } = await getMailActor(userId);
  const rows = await db.select({ recipientType: internalMailEntries.recipientType, status: internalMailMessages.status, importance: internalMailMessages.importance, isRead: internalMailEntries.isRead, isStarred: internalMailEntries.isStarred, archivedAt: internalMailEntries.archivedAt, trashedAt: internalMailEntries.trashedAt, count: sql<number>`COUNT(*)` }).from(internalMailEntries).innerJoin(internalMailMessages, eq(internalMailMessages.id, internalMailEntries.messageId)).where(eq(internalMailEntries.profileId, profile.id)).groupBy(internalMailEntries.recipientType, internalMailMessages.status, internalMailMessages.importance, internalMailEntries.isRead, internalMailEntries.isStarred, internalMailEntries.archivedAt, internalMailEntries.trashedAt);
  const counts: Record<InternalMailFolder, number> = { inbox: 0, sent: 0, drafts: 0, starred: 0, archive: 0, trash: 0 };
  let unread = 0;
  let urgentUnread = 0;
  for (const row of rows) {
    const count = Number(row.count);
    if (row.trashedAt) { counts.trash += count; continue; }
    if (row.isStarred) counts.starred += count;
    if (row.archivedAt) { counts.archive += count; continue; }
    if (row.recipientType === "sender" && row.status === "draft") counts.drafts += count;
    else if (row.recipientType === "sender" && row.status === "sent") counts.sent += count;
    else if (row.status === "sent") { counts.inbox += count; if (!row.isRead) { unread += count; if (row.importance === "high") urgentUnread += count; } }
  }
  return { counts, unread, urgentUnread };
}
