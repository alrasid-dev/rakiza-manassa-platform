/**
 * تطبيع أسماء الأقسام لمعالجة الأخطاء الإملائية والاختلافات الصرفية عند التسكين.
 * مثال: «إدارة الدعوى» و«إدارة الدعاوى» و«قسم الدعاوي» كلها تُوحَّد إلى «الدعاوى».
 */

/** إزالة التشكيل وتوحيد الهمزات والتاء المربوطة والألف المقصورة. */
export function normalizeArabic(text: string): string {
  return String(text ?? "")
    .replace(/[\u064B-\u065F\u0670]/g, "") // تشكيل
    .replace(/[أإآ]/g, "ا") // همزات الألف
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[\u0649ى]/g, "ي") // ألف مقصورة
    .replace(/ة/g, "ه") // تاء مربوطة
    .replace(/\s+/g, " ")
    .trim();
}

/** بادئات إدارية تُحذف عند المطابقة لأنها لا تغيّر هوية القسم. */
const PREFIXES = ["إدارة", "ادارة", "قسم", "وحدة", "مكتب", "شعبة"];

/**
 * مفتاح موحّد لاسم القسم يستخدم في المقارنة (بلا بادئة وبلا أل التعريف).
 */
export function departmentNameKey(name: string): string {
  let s = normalizeArabic(name);
  for (const prefix of PREFIXES) {
    const normalizedPrefix = normalizeArabic(prefix);
    if (s.startsWith(normalizedPrefix + " ")) {
      s = s.slice(normalizedPrefix.length).trim();
      break;
    }
  }
  s = s.replace(/^ال(?=\S)/u, "").trim();
  return s;
}

/** أسماء بديلة معروفة (مفرد/جمع) → الاسم المعتمد. */
const CANONICAL_ALIASES: Record<string, string> = {
  "دعوي": "الدعاوى",
  "دعاوي": "الدعاوى",
  // «الملازم» مفرد «الملازمين»: توحيد صيغة الجمع حتى لا تُعامل الكلمة كخطأ إملائي.
  // لاحظ أن المفتاح مُطبَّع (ؤ → و) بينما يبقى الاسم المعتمد بصورته الرسمية.
  "شوون الملازم": "شؤون الملازمين",
  "شوون الملازمين": "شؤون الملازمين",
};

/** الاسم المعتمد (الكنوني) للقسم بعد تطبيع الهمزات والجمع/المفرد. */
export function canonicalDepartmentName(name: string): string {
  const key = departmentNameKey(name);
  return CANONICAL_ALIASES[key] ?? key;
}

/**
 * يبحث عن أقرب قسم مطابق من قائمة الأقسام، متجاهلاً الأخطاء الإملائية الشائعة.
 * يعيد اسم القسم المطابق أو `null` عند عدم وجود تطابق.
 */
export function matchDepartmentName(candidates: string[], input: string): string | null {
  const inputKey = departmentNameKey(input);
  const inputCanonical = canonicalDepartmentName(input);
  for (const candidate of candidates) {
    if (departmentNameKey(candidate) === inputKey) return candidate;
    if (canonicalDepartmentName(candidate) === inputCanonical) return candidate;
  }
  return null;
}

