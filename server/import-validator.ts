import * as XLSX from "xlsx";
import { MAX_UPLOAD_SIZE } from "@shared/const";

export type ImportTemplate = "task_catalog" | "delay_register" | "weekly_follow_up" | "people_register" | "unknown";
export type ImportAnalysis = {
  template: ImportTemplate;
  sheets: string[];
  rowCount: number;
  headers: string[];
  status: "validated" | "requires_review" | "rejected";
  warnings: string[];
};

export type SmartImportSuggestion = {
  action: "schedule_delay_follow_up" | "schedule_task_follow_up" | "review_task_catalog" | "review_people_register" | "manual_review";
  title: string;
  description: string;
  requiresConfirmation: boolean;
};

const MAX_FILE_BYTES = MAX_UPLOAD_SIZE;

function normalized(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function includesAll(headers: string[], expected: string[]) {
  return expected.every(item => headers.includes(item));
}

export function analyzeExcelImport(buffer: Buffer): ImportAnalysis {
  if (buffer.byteLength === 0) throw new Error("الملف فارغ.");
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("يتجاوز حجم الملف الحد المسموح به للاستيراد الأولي.");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, bookVBA: false });
  if (!workbook.SheetNames.length) throw new Error("لا يحتوي الملف على أوراق عمل قابلة للقراءة.");
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headerRow = rows.find(row => row.some(cell => normalized(cell))) ?? [];
  const headers = headerRow.map(normalized).filter(Boolean).slice(0, 40);
  const rowCount = Math.max(0, rows.length - 1);
  const warnings: string[] = [];
  let template: ImportTemplate = "unknown";

  if (includesAll(headers, ["المهمة", "وقت التنفيذ", "الموظف المختص1"])) template = "task_catalog";
  else if (includesAll(headers, ["تصنيف التعثر", "تاريخ نشوء التعثر", "حالة المعالجة"])) template = "delay_register";
  else if (includesAll(headers, ["عنوان المهمة أو المعاملة", "حالة المهمة", "تاريخ الاستحقاق"])) template = "weekly_follow_up";
  else if (includesAll(headers, ["الاسم الكامل", "البريد الإلكتروني", "الدور الفعلي بالنظام"]) || includesAll(headers, ["اسم الملازم القضائي", "التشكيل القضائي الحالي"])) template = "people_register";
  else warnings.push("لم يتطابق الصف الأول مع القوالب المعتمدة؛ يلزم تحديد خريطة الحقول قبل الإدخال.");

  if (!rowCount) warnings.push("لا توجد صفوف بيانات بعد رأس الجدول.");
  const status = !rowCount ? "rejected" : template === "unknown" ? "requires_review" : "validated";
  return { template, sheets: workbook.SheetNames, rowCount, headers, status, warnings };
}

export function suggestImportAction(analysis: ImportAnalysis): SmartImportSuggestion {
  if (analysis.template === "delay_register") return { action: "schedule_delay_follow_up", title: "أرى أن هذا سجل متعثرات", description: `تمت قراءة ${analysis.rowCount} صفاً من سجل المتعثرات. هل ترغب بإنشاء مهام متابعة تلقائية للسجلات الجديدة بعد تأكيدك؟`, requiresConfirmation: true };
  if (analysis.template === "weekly_follow_up") return { action: "schedule_task_follow_up", title: "أرى أن هذا تقرير متابعة مهام", description: `تمت قراءة ${analysis.rowCount} صفاً قابلاً للمتابعة. هل ترغب بتحويل التغييرات إلى مهام تلقائية بعد تأكيدك؟`, requiresConfirmation: true };
  if (analysis.template === "task_catalog") return { action: "review_task_catalog", title: "أرى أن هذا جدول مهام", description: "يمكنك حفظه للمراجعة اليدوية قبل اعتماد أو تحديث قوالب المهام الدورية.", requiresConfirmation: true };
  if (analysis.template === "people_register") return { action: "review_people_register", title: "أرى أن هذا سجل أفراد", description: "يمكنك حفظه للمراجعة اليدوية قبل إنشاء أو تحديث ملفات الأفراد.", requiresConfirmation: true };
  return { action: "manual_review", title: "يتطلب الملف مراجعة يدوية", description: "لم يتطابق محتوى الملف مع نموذج معتمد بما يكفي للجدولة الآلية. يمكنك حفظه للمراجعة أو اختيار الإدخال اليدوي.", requiresConfirmation: false };
}
