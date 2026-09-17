/**
 * مخطط سير العمل: قراءة مستند (Word/Excel/PDF/نص) واستخراج خطوات العمل منه،
 * ثم عرضها كمخطط متسلسل وتوزيعها آلياً أو يدوياً كمهام فعلية.
 * لا يضيف هذا الملف أي جدول جديد؛ الخطوات المعتمدة تتحول إلى مهام عبر الجداول القائمة.
 */
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { extractRawText } from "mammoth";
import * as XLSX from "xlsx";
import { auditLogs, leaveRequests, notifications, organizationUnits, personProfiles, tasks } from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { matchStaffByName, normalizeArabicName } from "./platform-completion";
import { storageGetSignedUrl, storagePut } from "./storage";

export const WORKFLOW_SOURCE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
] as const;

export type WorkflowStep = {
  order: number;
  title: string;
  description: string;
  ownerUnitHint: string;
  deliverable: string;
  slaDays: number;
  dependsOnOrder: number | null;
};

export type WorkflowMap = { title: string; summary: string; steps: WorkflowStep[] };
export type WorkflowReadMethod = "docx" | "sheet" | "text" | "ocr" | "heuristic";
export type WorkflowStaffMember = { id: number; fullName: string; unitId: number | null; unitName: string; openWorkload: number };
export type WorkflowAssignment = { order: number; assigneeProfileId: number; matchReason: "name" | "unit" | "balanced" };
export type WorkflowAssignmentChoice = { order: number; assigneeProfileId: number | null; reason: "name" | "unit" | "balanced" };

const MAX_STEPS = 40;
const MAX_STEP_TITLE = 220;

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/[\u064B-\u065F\u0670]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeWorkflowMimeType(originalName: string, mimeType: string) {
  const name = originalName.trim().toLowerCase();
  const type = mimeType.trim().toLowerCase();
  if (type) return type;
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain";
}

function stripStepMarker(line: string) {
  return line
    .replace(/^\s*(?:[\u0660-\u0669\u06F0-\u06F9\d]+\s*[.)\-:]|[\-\u2022\u2023\u25AA\u25CF*>]+\s*|[(\u0660-\u0669\d]+[)]\s*)/, "")
    .replace(/^\s*(?:أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً)\s*[:،-]?\s*/, "")
    .replace(/^\s*ثم\s+/, "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s+/g, " ")
    .replace(/[.،؛:]+\s*$/, "")
    .trim();
}

const STEP_VERB_PATTERN = /^(?:ي[\u0621-\u064A]{2,}|ت[\u0621-\u064A]{2,}|مراجعة|اعتماد|إعداد|اعداد|إدخال|ادخال|توزيع|أرشفة|ارشفة|تبليغ|متابعة|تدقيق|تصوير|تسجيل|تحويل|إحالة|احالة|رد|إرسال|ارسال|رفع|دراسة|دراسه|تحرير|تبويب|قيد|صرف|حصر|تحديث)/;

export function workflowSlaDaysFromText(value: string) {
  const text = normalizeText(value);
  if (/يومين/.test(text)) return 2;
  if (/أسبوعين|اسبوعين/.test(text)) return 14;
  if (/شهرين/.test(text)) return 60;
  const digits = text.match(/([\u0660-\u0669\d]+)\s*(?:يوم|أيام|ايام)/);
  if (digits) {
    const parsed = Number(digits[1]!.replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660)));
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(120, parsed);
  }
  if (/يوم|فوري|في الحال|نفس اليوم/.test(text)) return 1;
  if (/أسبوع|اسبوع/.test(text)) return 7;
  if (/شهر/.test(text)) return 30;
  return 3;
}

export function workflowOwnerUnitHintFromText(value: string) {
  const match = normalizeText(value).match(/(?:إلى|الى|قسم|إدارة|ادارة|وحدة|شعبة|مكتب|لجنة)\s*([\u0621-\u064A\s]{3,40}?)(?=\s*(?:خلال|وبعد|ثم|،|,|\.|؛|\(|$))/);
  return match ? normalizeText(match[1]!).slice(0, 80) : "";
}

/** استخراج خطوات العمل من نص حر (قابل للاختبار بلا شبكة أو قاعدة بيانات). */
export function extractWorkflowStepsFromText(text: string, options: { maxSteps?: number } = {}): WorkflowStep[] {
  const maxSteps = Math.max(1, Math.min(MAX_STEPS, options.maxSteps ?? MAX_STEPS));
  const rawLines = String(text ?? "").split(/\r?\n|(?<=[\u061B;])\s+/);
  const steps: WorkflowStep[] = [];
  const seen = new Set<string>();
  for (const rawLine of rawLines) {
    const line = normalizeText(rawLine);
    if (line.length < 6 || line.length > 600) continue;
    const numbered = /^\s*(?:[\u0660-\u0669\u06F0-\u06F9\d]+\s*[.)\-:]|[\-\u2022\u2023\u25AA\u25CF*>]|[\u0660-\u0669\d]+[)])/.test(rawLine);
    const titled = /^(?:أولاً|ثانياً|ثالثاً|رابعاً|خامساً)\s*[:،-]/.test(line);
    const title = stripStepMarker(rawLine).slice(0, MAX_STEP_TITLE);
    if (title.length < 5) continue;
    if (!numbered && !titled && !STEP_VERB_PATTERN.test(title)) continue;
    if (/^(?:التاريخ|رقم|الموضوع|الاسم|المرفقات|التوقيع|تعميم|قرار|محضر)(?=\s|:|،|$)/.test(title) && !numbered) continue;
    const key = normalizeArabicName(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    steps.push({
      order: steps.length + 1,
      title,
      description: "",
      ownerUnitHint: workflowOwnerUnitHintFromText(rawLine),
      deliverable: "",
      slaDays: workflowSlaDaysFromText(rawLine),
      dependsOnOrder: steps.length ? steps.length : null,
    });
    if (steps.length >= maxSteps) break;
  }
  return steps;
}

function cleanStepField(value: unknown, limit: number) {
  return normalizeText(value).slice(0, limit);
}

/** تنظيف مخرجات الذكاء الاصطناعي وتحويلها إلى خريطة سير عمل صالحة للعرض والتوزيع. */
export function normalizeWorkflowMap(raw: unknown, fallbackTitle = "مخطط سير عمل"): WorkflowMap {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawSteps = Array.isArray(raw) ? raw : Array.isArray(source.steps) ? source.steps : [];
  const steps: WorkflowStep[] = [];
  const seen = new Set<string>();
  for (const item of rawSteps.slice(0, MAX_STEPS)) {
    const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const title = cleanStepField(entry.title ?? entry.step ?? entry.name, MAX_STEP_TITLE);
    if (title.length < 4) continue;
    const key = normalizeArabicName(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const description = cleanStepField(entry.description ?? entry.details ?? entry.note, 600);
    const slaCandidate = Number(entry.slaDays ?? entry.sla ?? entry.durationDays);
    const slaDays = Number.isFinite(slaCandidate) && slaCandidate > 0 ? Math.min(120, Math.trunc(slaCandidate)) : workflowSlaDaysFromText(`${title} ${description}`);
    steps.push({
      order: steps.length + 1,
      title,
      description,
      ownerUnitHint: cleanStepField(entry.ownerUnitHint ?? entry.unit ?? entry.department, 80),
      deliverable: cleanStepField(entry.deliverable ?? entry.output, 200),
      slaDays,
      dependsOnOrder: steps.length ? steps.length : null,
    });
  }
  const title = cleanStepField(source.title, 200) || cleanStepField(fallbackTitle, 200) || "مخطط سير عمل";
  const summary = cleanStepField(source.summary ?? source.description, 1_200);
  return { title, summary, steps };
}

export type WorkflowDiagramNode = { order: number; title: string; column: number; lane: number; x: number; y: number; width: number; height: number; centerX: number; centerY: number };
export type WorkflowDiagramEdge = { from: number; to: number; x1: number; y1: number; x2: number; y2: number };
export type WorkflowDiagram = { width: number; height: number; nodeWidth: number; nodeHeight: number; lanes: number; nodes: WorkflowDiagramNode[]; edges: WorkflowDiagramEdge[] };

/**
 * مخطط متسلسل من اليمين إلى اليسار بترتيب ثعباني: كل صف يُقرأ من اليمين لليسار،
 * ثم ينزل إلى الصف التالي من اليسار لليمين، مع وصلات بين الخطوات المتتابعة.
 */
export function buildWorkflowDiagram(steps: WorkflowStep[], options: { columns?: number } = {}): WorkflowDiagram {
  const nodeWidth = 220;
  const nodeHeight = 88;
  const gapX = 56;
  const gapY = 44;
  const padding = 24;
  const list = Array.isArray(steps) ? steps : [];
  const columns = Math.max(1, Math.min(4, Math.max(1, Math.trunc(options.columns ?? 3)), Math.max(1, list.length)));
  const lanes = Math.max(1, Math.ceil(list.length / columns));
  const nodes: WorkflowDiagramNode[] = list.map((step, index) => {
    const lane = Math.floor(index / columns);
    const positionInLane = index % columns;
    const offsetFromRight = lane % 2 === 0 ? positionInLane : columns - 1 - positionInLane;
    const x = padding + (columns - 1 - offsetFromRight) * (nodeWidth + gapX);
    const y = padding + lane * (nodeHeight + gapY);
    return { order: step.order, title: step.title, column: offsetFromRight, lane, x, y, width: nodeWidth, height: nodeHeight, centerX: x + nodeWidth / 2, centerY: y + nodeHeight / 2 };
  });
  const edges: WorkflowDiagramEdge[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const from = nodes[index - 1]!;
    const to = nodes[index]!;
    if (from.lane === to.lane) {
      const toIsLeft = to.x < from.x;
      edges.push({ from: from.order, to: to.order, x1: toIsLeft ? from.x : from.x + from.width, y1: from.centerY, x2: toIsLeft ? to.x + to.width : to.x, y2: to.centerY });
    } else {
      edges.push({ from: from.order, to: to.order, x1: from.centerX, y1: from.y + from.height, x2: to.centerX, y2: to.y });
    }
  }
  return { width: padding * 2 + columns * nodeWidth + (columns - 1) * gapX, height: padding * 2 + lanes * nodeHeight + (lanes - 1) * gapY, nodeWidth, nodeHeight, lanes, nodes, edges };
}

/** توزيع آلي: مطابقة الاسم إن ورد في نص الخطوة، ثم وحدة المالك المقترحة، ثم الأقل حملاً. */
export function autoDistributeWorkflowSteps(input: { steps: Array<{ order: number; title: string; ownerUnitHint?: string | null }>; staff: WorkflowStaffMember[] }): WorkflowAssignment[] {
  const staff = (input.staff ?? []).filter(member => Number.isFinite(member.id));
  if (!staff.length) return [];
  const workload = new Map(staff.map(member => [member.id, Math.max(0, Math.trunc(member.openWorkload ?? 0))]));
  const leastLoaded = () => [...staff].sort((a, b) => (workload.get(a.id)! - workload.get(b.id)!) || a.id - b.id)[0]!;
  return (input.steps ?? []).map(step => {
    const named = matchStaffByName(step.title, staff);
    let member = named;
    let matchReason: WorkflowAssignment["matchReason"] = "name";
    if (!member && step.ownerUnitHint) {
      const hint = normalizeArabicName(step.ownerUnitHint);
      const unitMatches = staff.filter(candidate => {
        const unit = normalizeArabicName(candidate.unitName);
        return unit.length >= 3 && hint.length >= 3 && (unit.includes(hint) || hint.includes(unit));
      });
      if (unitMatches.length) {
        member = unitMatches.sort((a, b) => (workload.get(a.id)! - workload.get(b.id)!) || a.id - b.id)[0]!;
        matchReason = "unit";
      }
    }
    if (!member) {
      member = leastLoaded();
      matchReason = "balanced";
    }
    workload.set(member.id, workload.get(member.id)! + 1);
    return { order: step.order, assigneeProfileId: member.id, matchReason };
  });
}

function normalizeMultiline(value: string) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 40_000);
}

/** قراءة نص المستند محلياً لملفات Word وExcel والنصوص؛ أما PDF والصور فتُقرأ بالذكاء الاصطناعي. */
export async function workflowTextFromDocument(input: { originalName: string; mimeType: string; buffer: Buffer }): Promise<{ text: string; method: WorkflowReadMethod }> {
  const mimeType = normalizeWorkflowMimeType(input.originalName, input.mimeType);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await extractRawText({ buffer: input.buffer });
    return { text: normalizeMultiline(result.value), method: "docx" };
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || mimeType === "application/vnd.ms-excel" || mimeType === "text/csv") {
    const workbook = mimeType === "text/csv"
      ? XLSX.read(input.buffer.toString("utf8"), { type: "string" })
      : XLSX.read(input.buffer, { type: "buffer", cellDates: true, bookVBA: false });
    const chunks: string[] = [];
    for (const name of workbook.SheetNames.slice(0, 10)) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
      const lines = rows
        .map(row => (Array.isArray(row) ? row : []).map(cell => String(cell ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" | "))
        .filter(Boolean);
      chunks.push(`# ${name}\n${lines.join("\n")}`);
    }
    return { text: normalizeMultiline(chunks.join("\n")), method: "sheet" };
  }
  if (mimeType === "application/pdf" || mimeType === "image/png" || mimeType === "image/jpeg") return { text: "", method: "ocr" };
  return { text: normalizeMultiline(input.buffer.toString("utf8")), method: "text" };
}

const WORKFLOW_SYSTEM_PROMPT = [
  "أنت محلل إجراءات إدارية في محكمة سعودية. تُعطى لك وثيقة إجراءات أو خطة عمل أو تقرير إنجاز.",
  "أعد JSON فقط بلا أي شرح أو تنسيق إضافي وفق الشكل:",
  '{"title":"عنوان مختصر للمخطط","summary":"ملخص الإجراء في سطرين","steps":[{"title":"عنوان الخطوة الإجرائية","description":"ما يفعله المنفذ","ownerUnitHint":"الوحدة أو القسم المسؤول إن ورد","deliverable":"المخرج المطلوب","slaDays":3}]}',
  "قواعد ملزمة: لا تخترع خطوات غير واردة في الوثيقة، واجعل ترتيب الخطوات مطابقاً لتسلسل الوثيقة من البداية إلى الاعتماد النهائي،",
  "ووحّد كل خطوة في بند واحد قصير لا يتجاوز 200 حرف، واحصر العدد بين 3 و40 خطوة. إن لم تجد خطوات إجرائية واضحة فأعد steps فارغة.",
  "لا تنفذ أي إجراء ولا تقترح أسماء أشخاص؛ الاقتراح هنا للخطوات فقط.",
].join(" ");

function parseJsonPayload(content: unknown) {
  const text = (typeof content === "string" ? content : Array.isArray(content) ? content.filter((part: { type?: string }) => part?.type === "text").map((part: { text?: string }) => part.text ?? "").join("\n") : "").trim();
  if (!text) return null;
  const withoutFences = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? withoutFences.slice(start, end + 1) : withoutFences;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

async function logWorkflowAudit(input: { actorUserId: number; action: string; metadata?: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values({ actorUserId: input.actorUserId, action: input.action, entityType: "workflow_map", metadata: JSON.stringify(input.metadata ?? {}) });
  } catch (error) {
    console.warn("[WorkflowMap] تعذر تسجيل أثر المخطط دون تعطيل العملية", { error });
  }
}

type WorkflowLlmPart = { type: "text"; text: string } | { type: "file_url"; file_url: { url: string; mime_type: "application/pdf" } } | { type: "image_url"; image_url: { url: string; detail: "high" } };

export const MAX_WORKFLOW_SOURCE_BYTES = 10 * 1024 * 1024;

/**
 * تحليل مستند مخطط سير العمل: قراءة محلية لـ Word وExcel، وقراءة ذكية (OCR) لـ PDF والصور،
 * ثم استخراج الخطوات وبناء المخطط. عند تعذر التحليل الذكي يُستخدم الاستخراج الحرفي للنص.
 */
export async function analyzeWorkflowDocument(input: { userId: number; originalName: string; mimeType: string; contentBase64: string }) {
  const bytes = Buffer.from(String(input.contentBase64 ?? ""), "base64");
  if (!bytes.length) throw new Error("لم يصل أي محتوى من الملف المرفوع.");
  if (bytes.length > MAX_WORKFLOW_SOURCE_BYTES) throw new Error("الحد الأقصى لحجم ملف المخطط 10 ميجابايت.");
  const mimeType = normalizeWorkflowMimeType(input.originalName, input.mimeType);
  if (!(WORKFLOW_SOURCE_MIME_TYPES as readonly string[]).includes(mimeType)) throw new Error("الصيغ المدعومة: Word وExcel وCSV وTXT وPDF وصور PNG/JPEG.");
  const fallbackTitle = input.originalName.replace(/\.[^.]+$/, "").trim().slice(0, 200) || "مخطط سير عمل";
  const local = await workflowTextFromDocument({ originalName: input.originalName, mimeType, buffer: bytes });
  let documentPart: WorkflowLlmPart | null = null;
  if (local.method === "ocr") {
    const safeName = input.originalName.replace(/[^\w.\-\u0600-\u06FF]/g, "_").slice(-120) || "document";
    const stored = await storagePut(`workflow-maps/${input.userId}/${Date.now()}-${safeName}`, bytes, mimeType);
    const signedUrl = await storageGetSignedUrl(stored.key);
    documentPart = mimeType === "application/pdf"
      ? { type: "file_url", file_url: { url: signedUrl, mime_type: "application/pdf" } }
      : { type: "image_url", image_url: { url: signedUrl, detail: "high" } };
  }
  const sourceText = local.text.slice(0, 30_000);
  const userContent: WorkflowLlmPart[] = [{ type: "text", text: sourceText ? `استخرج مخطط سير العمل من هذا النص:\n${sourceText}` : "استخرج مخطط سير العمل من هذا المستند." }];
  if (documentPart) userContent.push(documentPart);
  let aiModel: string | null = null;
  let aiText = "";
  let map = normalizeWorkflowMap(null, fallbackTitle);
  try {
    const result = await invokeLLM({ model: "gemini-3-flash-preview", maxTokens: 8_000, messages: [{ role: "system", content: WORKFLOW_SYSTEM_PROMPT }, { role: "user", content: userContent }] });
    aiModel = result.model ?? null;
    const content = result.choices[0]?.message.content;
    aiText = typeof content === "string" ? content : Array.isArray(content) ? content.filter(part => part?.type === "text").map(part => part.text ?? "").join("\n") : "";
    const parsed = parseJsonPayload(content);
    if (parsed) map = normalizeWorkflowMap(parsed, fallbackTitle);
  } catch (error) {
    console.warn("[WorkflowMap] تعذر التحليل الذكي وسيُستخدم الاستخراج الحرفي للنص", { error });
  }
  let method: WorkflowReadMethod = local.method;
  if (!map.steps.length) {
    const heuristic = extractWorkflowStepsFromText(sourceText || aiText);
    if (heuristic.length) {
      method = "heuristic";
      map = { title: map.title || fallbackTitle, summary: map.summary, steps: heuristic };
    }
  }
  if (!map.steps.length) throw new Error("لم يُعثر على خطوات إجرائية في المستند. تأكد من أن الملف يحتوي إجراءات مرقمة أو بنوداً واضحة.");
  const diagram = buildWorkflowDiagram(map.steps);
  await logWorkflowAudit({ actorUserId: input.userId, action: "workflow_map.analyzed", metadata: { documentName: input.originalName, mimeType, method, model: aiModel, steps: map.steps.length, bytes: bytes.length } });
  return { map, diagram, extractedText: sourceText.slice(0, 20_000), method, model: aiModel, documentName: input.originalName };
}

/** الموظفون المتاحون للإسناد في النطاق المحدد مع وحداتهم وحملهم الحالي من المهام المفتوحة. */
export async function listWorkflowStaff(input: { unitIds: number[] }): Promise<WorkflowStaffMember[]> {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const scope = (input.unitIds ?? []).filter(unitId => Number.isFinite(unitId));
  const baseFilter = and(eq(personProfiles.personType, "administrative"), eq(personProfiles.status, "active"));
  const staffRows = await db.select({ id: personProfiles.id, fullName: personProfiles.fullName, unitId: personProfiles.unitId, unitName: organizationUnits.name })
    .from(personProfiles)
    .leftJoin(organizationUnits, eq(organizationUnits.id, personProfiles.unitId))
    .where(scope.length ? and(baseFilter, inArray(personProfiles.unitId, scope)) : baseFilter)
    .orderBy(personProfiles.fullName);
  if (!staffRows.length) return [];
  const ids = staffRows.map(row => row.id);
  const now = new Date();
  const [workloadRows, leaveRows] = await Promise.all([
    db.select({ profileId: tasks.assigneeProfileId, count: sql<number>`count(*)` }).from(tasks).where(and(inArray(tasks.assigneeProfileId, ids), inArray(tasks.status, ["new", "in_progress", "under_review"]))).groupBy(tasks.assigneeProfileId),
    db.select({ profileId: leaveRequests.profileId }).from(leaveRequests).where(and(inArray(leaveRequests.profileId, ids), inArray(leaveRequests.status, ["approved", "active"]), lte(leaveRequests.startAt, now), gte(leaveRequests.endAt, now))),
  ]);
  const workload = new Map(workloadRows.filter(row => row.profileId).map(row => [row.profileId!, Number(row.count) || 0]));
  const onLeave = new Set(leaveRows.map(row => row.profileId));
  return staffRows.filter(row => !onLeave.has(row.id)).map(row => ({ id: row.id, fullName: row.fullName, unitId: row.unitId ?? null, unitName: row.unitName ?? "", openWorkload: workload.get(row.id) ?? 0 }));
}

export type WorkflowDistributionStep = { order: number; title: string; description?: string; assigneeProfileId?: number | null; priority?: "normal" | "high" | "critical"; slaDays?: number; dueAt?: Date | null };

/**
 * توزيع خطوات المخطط: آلي (مطابقة الاسم ثم الوحدة ثم الأقل حملاً) أو يدوي (منفذ محدد لكل خطوة)،
 * ثم إنشاء مهام فعلية بإشعارات مسندة. لا يعتمد على أي جدول جديد.
 */
export async function distributeWorkflowSteps(input: { actorUserId: number; unitIds: number[]; unitId: number | null; sourceName: string; title: string; mode: "auto" | "manual"; steps: WorkflowDistributionStep[] }) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const steps = (input.steps ?? []).slice(0, MAX_STEPS).map((step, index) => ({
    order: index + 1,
    title: normalizeText(step.title).slice(0, MAX_STEP_TITLE),
    description: normalizeText(step.description ?? "").slice(0, 600),
    assigneeProfileId: Number.isFinite(Number(step.assigneeProfileId)) ? Number(step.assigneeProfileId) : null,
    priority: step.priority ?? "normal",
    slaDays: Math.min(120, Math.max(1, Math.trunc(Number(step.slaDays) || 3))),
    dueAt: step.dueAt instanceof Date && !Number.isNaN(step.dueAt.getTime()) ? step.dueAt : null,
  })).filter(step => step.title.length >= 3);
  if (!steps.length) throw new Error("أضف خطوة واحدة صالحة على الأقل قبل التوزيع.");
  const staff = await listWorkflowStaff({ unitIds: input.unitIds });
  if (!staff.length) throw new Error("لا يوجد موظف متاح للإسناد في نطاقك حالياً.");
  const allowed = new Map(staff.map(member => [member.id, member]));
  let assignments: WorkflowAssignment[];
  if (input.mode === "auto") {
    assignments = autoDistributeWorkflowSteps({ steps, staff });
  } else {
    assignments = steps.map(step => {
      if (!step.assigneeProfileId || !allowed.has(step.assigneeProfileId)) throw new Error(`اختر منفذاً متاحاً للخطوة «${step.title}».`);
      return { order: step.order, assigneeProfileId: step.assigneeProfileId, matchReason: "name" as const };
    });
  }
  const now = new Date();
  const createdTaskIds: number[] = [];
  const created: Array<{ order: number; taskId: number; assigneeProfileId: number; title: string }> = [];
  for (const step of steps) {
    const assignment = assignments.find(item => item.order === step.order);
    if (!assignment) continue;
    const dueAt = step.dueAt ?? new Date(now.getTime() + step.slaDays * 24 * 60 * 60 * 1000);
    const inserted = await db.insert(tasks).values({
      title: `متابعة مخطط: ${step.title}`.slice(0, 500),
      status: "new",
      priority: step.priority,
      unitId: input.unitId ?? allowed.get(assignment.assigneeProfileId)?.unitId ?? null,
      assigneeProfileId: assignment.assigneeProfileId,
      assignedByUserId: input.actorUserId,
      scheduledFor: now,
      dueAt,
    });
    const taskId = Number(inserted[0].insertId);
    createdTaskIds.push(taskId);
    created.push({ order: step.order, taskId, assigneeProfileId: assignment.assigneeProfileId, title: step.title });
    try {
      await db.insert(notifications).values({
        profileId: assignment.assigneeProfileId,
        category: "task_due",
        title: "مهمة جديدة من مخطط سير العمل",
        body: `أُسندت إليك خطوة «${step.title}» من ${input.sourceName}. راجعها وابدأ التنفيذ خلال المدة المحددة.`,
        dedupeKey: `workflow-map-task-${taskId}-${assignment.assigneeProfileId}`,
      });
    } catch (error) {
      console.warn("[WorkflowMap] تعذر إرسال إشعار إسناد الخطوة دون تعطيل الإنشاء", { taskId, error });
    }
  }
  await logWorkflowAudit({ actorUserId: input.actorUserId, action: "workflow_map.distributed", metadata: { mode: input.mode, sourceName: input.sourceName, title: input.title, steps: created.length, autoMatched: assignments.filter(item => item.matchReason !== "balanced").length } });
  return { createdTaskIds, created, assignments, mode: input.mode, sourceName: input.sourceName };
}








