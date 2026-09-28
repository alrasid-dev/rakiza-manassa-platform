/** قواعد تشغيل مجانية للمنصة الداخلية: صلاحيات، حضور، تقارير، بحث، تذكير، مداورة. */

export type WorkMode = "employee" | "manager";
export type AttendancePeriod = "daily" | "weekly" | "monthly";
export type NotificationFilter = "all" | "unread" | "tasks" | "mail" | "attendance" | "leave" | "escalation";
export type DeadlineNudgeKind = "none" | "24h" | "12h";
export type ProfileAssignmentStatus = "active" | "on_leave" | "inactive" | "pending_review";

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g;

export function normalizeArabicName(value: string) {
  return value
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar");
}

export function normalizeSaudiPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("966") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("05") && digits.length === 10) return `+966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `+966${digits}`;
  return digits.length >= 9 ? `+${digits}` : "";
}

export function isValidSaudiPhone(value: string) {
  return /^\+9665\d{8}$/.test(normalizeSaudiPhone(value));
}

export function profileCanReceiveNewTask(status?: ProfileAssignmentStatus | null) {
  return status === "active";
}

export function assignmentBlockReason(status?: ProfileAssignmentStatus | null) {
  if (status === "on_leave") return "لا يمكن إسناد مهمة جديدة لموظف في إجازة أو غياب معتمد.";
  if (status === "inactive") return "لا يمكن إسناد مهمة لموظف موقوف عن العمل.";
  if (status === "pending_review") return "لا يمكن إسناد مهمة لملف ما زال قيد المراجعة.";
  if (!status) return "ملف المكلف غير موجود.";
  return null;
}

export function matchStaffByName<T extends { id: number; fullName: string }>(title: string, staff: T[]) {
  const haystack = normalizeArabicName(title);
  if (haystack.length < 4 || !staff.length) return undefined;
  const exact = staff.filter(member => {
    const name = normalizeArabicName(member.fullName);
    return name.length >= 4 && (haystack.includes(name) || name.split(" ").filter(part => part.length >= 3).every(part => haystack.includes(part)));
  });
  if (exact.length === 1) return exact[0];
  const partial = staff.filter(member => {
    const tokens = normalizeArabicName(member.fullName).split(" ").filter(part => part.length >= 4);
    return tokens.some(token => haystack.includes(token));
  });
  return partial.length === 1 ? partial[0] : undefined;
}

export function assignPerformanceTasksByNameOrEvenly<T extends { id: number; fullName: string; openWorkload: number }>(
  candidates: Array<{ title: string; source: "word" | "excel" }>,
  staff: T[],
) {
  const loads = staff.map(member => ({ ...member }));
  const assignments: Array<{ title: string; source: "word" | "excel"; assigneeId: number; matchedByName: boolean }> = [];
  const unmatched: Array<{ title: string; source: "word" | "excel" }> = [];
  for (const candidate of candidates) {
    const named = matchStaffByName(candidate.title, loads);
    if (named) {
      assignments.push({ ...candidate, assigneeId: named.id, matchedByName: true });
      named.openWorkload += 1;
    } else unmatched.push(candidate);
  }
  for (const candidate of unmatched) {
    const assignee = [...loads].sort((a, b) => a.openWorkload - b.openWorkload || a.id - b.id)[0];
    if (!assignee) break;
    assignments.push({ ...candidate, assigneeId: assignee.id, matchedByName: false });
    assignee.openWorkload += 1;
  }
  return assignments;
}

export function mentionedUnknownNames(text: string, staffNames: string[]) {
  const known = new Set(staffNames.map(normalizeArabicName).filter(name => name.length >= 4));
  const tokens = normalizeArabicName(text).split(/[^\u0621-\u064Aa-z0-9]+/).filter(token => token.length >= 4);
  const mentioned = new Set<string>();
  for (const name of known) {
    if (normalizeArabicName(text).includes(name)) mentioned.add(name);
  }
  const unknown: string[] = [];
  const nameLike = text.match(/(?:الموظف|المكلف|الأستاذ|الأستاذة)\s+([^\n،,]{6,40})/g) ?? [];
  for (const match of nameLike) {
    const extracted = normalizeArabicName(match.replace(/^(?:الموظف|المكلف|الأستاذ|الأستاذة)\s+/, ""));
    if (extracted.length >= 6 && ![...known].some(name => extracted.includes(name) || name.includes(extracted))) unknown.push(extracted);
  }
  return { mentionedCount: mentioned.size, unknown, tokenCount: tokens.length };
}

export function detectContradictions(text: string) {
  const normalized = normalizeArabicName(text);
  const completed = /(?:تم|اكتمل|انجز|أنجز|مغلقه|مغلق)/.test(normalized);
  const incomplete = /(?:لم يتم|غير مكتمل|ناقص|متعثر|معلق|لم ينجز)/.test(normalized);
  return completed && incomplete;
}

export function evaluatePerformanceReportIntegrity(input: { text: string; staffNames: string[]; extractedCount: number }) {
  const reasons: string[] = [];
  const trimmed = input.text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 40) reasons.push("التقرير ناقص ولا يحتوي نصاً كافياً للقراءة.");
  if (input.extractedCount < 1) reasons.push("تعذر استخراج أي مهمة أو إجراء قابل للإسناد من المرفق.");
  if (detectContradictions(trimmed)) reasons.push("التقرير يحتوي عبارات متناقضة حول الإنجاز والتعثر في الوقت نفسه.");
  const unknown = mentionedUnknownNames(trimmed, input.staffNames).unknown;
  if (unknown.length) reasons.push(`وردت أسماء غير موجودة في القسم: ${unknown.slice(0, 3).join("، ")}.`);
  return reasons.length ? { accepted: false as const, reasons } : { accepted: true as const, reasons: [] };
}

export function attendancePeriodRange(period: AttendancePeriod, reference = new Date()) {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  if (period === "daily") return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  if (period === "weekly") {
    const weekday = start.getUTCDay();
    const sunday = new Date(start.getTime() - weekday * 24 * 60 * 60 * 1000);
    return { start: sunday, end: new Date(sunday.getTime() + 7 * 24 * 60 * 60 * 1000) };
  }
  const monthStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  return { start: monthStart, end: new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1)) };
}

export function summarizeAttendanceRecords<T extends { status: string; recordDate: Date | string }>(records: T[], period: AttendancePeriod, reference = new Date()) {
  const { start, end } = attendancePeriodRange(period, reference);
  const inRange = records.filter(record => {
    const time = new Date(record.recordDate).getTime();
    return time >= start.getTime() && time < end.getTime();
  });
  const count = (status: string) => inRange.filter(record => record.status === status).length;
  return {
    period,
    start,
    end,
    total: inRange.length,
    present: count("present"),
    late: count("late"),
    absent: count("absent"),
    excused: count("excused"),
    onLeave: count("on_leave"),
  };
}

export function deadlineNudgeKind(dueAt: Date, now = new Date()): DeadlineNudgeKind {
  const remaining = dueAt.getTime() - now.getTime();
  if (remaining <= 0) return "none";
  if (remaining <= 12 * 60 * 60 * 1000) return "12h";
  if (remaining <= 24 * 60 * 60 * 1000) return "24h";
  return "none";
}

export function isDelegationActive(input: { startsAt: Date; endsAt: Date | null; now?: Date }) {
  const now = input.now ?? new Date();
  return input.startsAt.getTime() <= now.getTime() && (input.endsAt == null || input.endsAt.getTime() > now.getTime());
}

export function resolveWorkMode(hasLeadershipScope: boolean, stored?: WorkMode | null): WorkMode {
  if (!hasLeadershipScope) return "employee";
  return stored === "employee" ? "employee" : "manager";
}

export function notificationMatchesFilter(item: { isRead: boolean; category: string }, filter: NotificationFilter) {
  if (filter === "all") return true;
  if (filter === "unread") return !item.isRead;
  if (filter === "tasks") return /task|delay|escalat/i.test(item.category);
  if (filter === "mail") return /mail|chat|correspond/i.test(item.category);
  if (filter === "attendance") return /attendance/i.test(item.category);
  if (filter === "leave") return /leave/i.test(item.category);
  return /escalat|delay|disciplin/i.test(item.category);
}

export function scoreSearchHit(query: string, fields: Array<string | null | undefined>) {
  const needle = normalizeArabicName(query);
  if (needle.length < 2) return 0;
  let score = 0;
  for (const field of fields) {
    const haystack = normalizeArabicName(field ?? "");
    if (!haystack) continue;
    if (haystack === needle) score += 8;
    else if (haystack.startsWith(needle)) score += 5;
    else if (haystack.includes(needle)) score += 3;
  }
  return score;
}

export function rankSearchResults<T extends { score: number }>(items: T[], limit = 25) {
  return [...items].filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function buildOwnerKpis(input: {
  units: Array<{ unitName: string; completionRate: number; overdueRate: number; open: number }>;
  pressure: Array<{ unitName: string; pressureScore: number; pressureLevel: string }>;
  accountabilityCount: number;
  averageCompletionHours: number | null;
  employees?: Array<{ profileId: number; fullName: string; points: number; complianceRate: number | null }>;
}) {
  const completion = input.units.length ? Math.round(input.units.reduce((sum, unit) => sum + unit.completionRate, 0) / input.units.length) : 0;
  const highPressure = input.pressure.filter(unit => unit.pressureLevel === "high").map(unit => unit.unitName);
  const lowPressure = input.pressure.filter(unit => unit.pressureLevel === "low" || unit.pressureLevel === "none").map(unit => unit.unitName);
  const rotationSuggestions = highPressure.slice(0, 3).map((from, index) => ({
    from,
    to: lowPressure[index] || "قسم أقل ضغطاً",
    reason: `ضغط مرتفع في ${from} مع سعة ظاهرة في الجهة المقترحة. أي تدوير يحتاج اعتماد الرئيس أو الأمين.`,
  }));
  const ranking = [...(input.employees ?? [])].sort((a, b) => b.points - a.points || a.profileId - b.profileId);
  return {
    departmentCompletionRate: completion,
    highPressureDepartments: highPressure,
    accountabilityCount: input.accountabilityCount,
    averageCompletionHours: input.averageCompletionHours,
    rotationSuggestions,
    employeeRanking: ranking,
    topPerformers: ranking.slice(0, 5),
    lowPerformers: ranking.slice(-5).reverse(),
  };
}

export function defaultWorkPreferences() {
  return {
    workMode: "manager" as WorkMode,
    notificationsEnabled: true,
    dndUntil: null as string | null,
    seenHelpKeys: [] as string[],
  };
}

export function isDoNotDisturbActive(dndUntil?: string | null, now = new Date()) {
  if (!dndUntil) return false;
  const until = new Date(dndUntil);
  return !Number.isNaN(until.getTime()) && until.getTime() > now.getTime();
}

export function administrativeRouteOrder() {
  return ["department_manager", "peer_department_manager", "court_secretary", "assistant_secretary", "assistant_president", "court_president"] as const;
}

export const ICON_GUIDE = [
  { name: "مهامي", contains: "قائمة المهام المسندة إليك مع الحالة والأولوية وموعد الاستحقاق.", actions: "بدء التنفيذ، تمت المعالجة، تعليق، طلب سحب، الإبلاغ عن عائق.", who: "كل المستخدمين ضمن نطاقهم.", notes: "المهام الجديدة لا تُسند لمن هم في إجازة أو موقوفين." },
  { name: "الإشعارات", contains: "مركز موحد للمهام والبريد والحضور والإجازات والتصعيد.", actions: "التصفية، قراءة واحدة أو قراءة الكل، فتح المصدر.", who: "كل المستخدمين.", notes: "وضع عدم الإزعاج يوقف التنبيهات الصوتية والدفع حتى الوقت المحدد." },
  { name: "الدردشات", contains: "محادثات القسم والمباشرة ومجموعات العمل.", actions: "إرسال، رد، إعادة توجيه، مرفقات، تثبيت.", who: "كل المستخدمين ضمن نطاقهم.", notes: "لا تظهر محادثات الأقسام الأخرى." },
  { name: "بريد ركيزة", contains: "صندوق بريد داخلي بحجم شاشة شبه كامل مع مجلدات وبحث.", actions: "قراءة، رد، إعادة توجيه، مرفقات، مسودة، جدولة، أرشفة.", who: "كل من له ملف موظف مرتبط.", notes: "البريد داخلي مجاني ولا يعتمد على Microsoft 365." },
  { name: "AI ركيزة", contains: "مساعد استباقي يقترح ويرصد ولا ينفذ قرارات إدارية.", actions: "طلب اقتراح، مراجعة توصية، إلغاء تنفيذ آلي.", who: "حسب القسم والصلاحية.", notes: "التوصية ليست قراراً ولا تُستخدم للعقوبة دون اعتماد بشري." },
  { name: "الإعلانات الداخلية", contains: "التعاميم والإعلانات الرسمية ضمن نطاقك.", actions: "القراءة. النشر لمالك المنصة فقط.", who: "الجميع للقراءة.", notes: "لا تُعرض إعلانات وحدة أخرى." },
  { name: "المتعثرات", contains: "سجل المعاملات المتعثرة ومتابعتها.", actions: "تسجيل تعثر، متابعة الحالة.", who: "الموظف الإداري والقيادة. الملازم لا يراها.", notes: "مرتبطة بالتصعيد الآلي بعد المهلة." },
  { name: "إعدادات المنصة / إعدادات الموظف", contains: "التنبيهات، الدليل، عدم الإزعاج، صوت التوصيات.", actions: "تفعيل أو إيقاف التنبيهات، فتح الدليل.", who: "كل المستخدمين على جهازهم.", notes: "لا تغيّر صلاحيات الآخرين." },
  { name: "الرئيسية", contains: "لوحة شخصية حسب الأولوية مع تخصيص الأيقونات.", actions: "ترتيب الوحدات، إخفاء اختصارات، فتح مهمة.", who: "كل المستخدمين. مؤشرات الأقسام للقيادة.", notes: "القائد يبدّل بين وضع الموظف ووضع المدير من الشريط العلوي." },
  { name: "رفع التقارير", contains: "رفع PDF أو Word أو Excel لمراقبة الأداء.", actions: "رفع المرفق، طلب تحويله لمهام.", who: "كل المستخدمين المخولين. التحويل لمهام لمراقبة الأداء.", notes: "التقرير الناقص أو المتناقض أو بأسماء غير موجودة يُرفض تلقائياً." },
  { name: "مراجعة تقييم التقارير", contains: "تحليل آلي واقتراح نقاط دون تطبيق تلقائي.", actions: "قبول، إعادة، رفض مع سبب.", who: "القيادة ومديرو الأقسام.", notes: "النقاط لا تُحتسب إلا بقرار المدير." },
  { name: "التقارير المنفصلة", contains: "تقارير يومية وأسبوعية وشهرية قابلة للتصفية.", actions: "التصفية والتصدير.", who: "القيادة وصلاحية الاطلاع الشامل.", notes: "لا تظهر بيانات خارج النطاق." },
  { name: "سجل الإنجازات", contains: "النقاط الإيجابية والسلبية المرتبطة بملفك.", actions: "الاطلاع فقط.", who: "صاحب الملف، والقيادة ضمن النطاق.", notes: "لا يعرض نقاط الآخرين للموظف." },
  { name: "دليل المستخدم", contains: "شرح كل أيقونة وصلاحيتها.", actions: "القراءة حسب دورك.", who: "الجميع.", notes: "يظهر أيضاً كمساعدة أول استخدام." },
  { name: "مكتب رئيس المحكمة", contains: "لوحة القيادة الشاملة ومؤشرات المحكمة.", actions: "المتابعة والتخصيص.", who: "المالك ورئيس المحكمة والقيادة المخولة.", notes: "الصلاحيات المطلقة للمالك ورئيس المحكمة فقط." },
  { name: "مرصد ضغط العمل", contains: "كثافة العمل لكل قسم دون تنفيذ تلقائي.", actions: "قراءة المؤشرات واقتراحات التوازن.", who: "الرئيس والأمين ومساعد الرئيس والمالك.", notes: "لا ينقل الموظفين من تلقاء نفسه." },
  { name: "المداورة", contains: "اقتراحات إعادة التوزيع وتدوير الموظفين.", actions: "اعتماد اقتراح بشري أو رفضه.", who: "المالك ورئيس المحكمة والأمين فقط.", notes: "أي تدوير يُحفظ في سجل التدقيق." },
  { name: "تفويض", contains: "مهمة تفويض مؤقتة تمنح صلاحية ثم تختفي بانتهاء المدة.", actions: "إنشاء تفويض، تحديد المفوض إليه والمدة، إلغاء.", who: "رئيس المحكمة والمالك.", notes: "الصلاحية تظهر عند المفوض إليه فقط أثناء سريان المهمة." },
  { name: "مؤشرات القيادة", contains: "نسبة إنجاز الأقسام، الضغط، عدد المساءلات، متوسط وقت الإنجاز، اقتراحات المداورة.", actions: "الاطلاع والتصدير.", who: "المالك ورئيس المحكمة فقط.", notes: "لوحة عالية المستوى وليست أداة عقوبة." },
  { name: "الحضور والانصراف", contains: "نافذة منبثقة لتسجيل الحضور والانصراف وسجل يومي وأسبوعي وشهري.", actions: "تسجيل حضور/انصراف، تصفح السجل.", who: "كل موظف مرتبط بملف نشط ضمن نافذة الوردية.", notes: "الوقت من ساعة المنصة. الإجازة تظهر في السجل وتوقف الإسناد." },
  { name: "الاستئذان والإجازات", contains: "طلب إجازة أو استئذان مع تسليم المهام لبديل.", actions: "تقديم الطلب. الاعتماد للمدير.", who: "الموظف لتقديم طلبه. المدير للمراجعة.", notes: "أي إجازة معتمدة توقف إسناد المهام الجديدة وتظهر للمدير." },
  { name: "الموارد البشرية والموظفون", contains: "ملفات الموظفين والتفعيل والإيقاف.", actions: "إضافة، تعديل، إيقاف يوزر من توقف عن العمل.", who: "الموارد البشرية والقيادة.", notes: "الموقوف لا يدخل النظام إلا بتعديل من المختصين." },
  { name: "الأرشيف", contains: "أرشيف ذكي قابل للبحث دون حذف.", actions: "بحث، استرجاع، أرشفة قسم كامل.", who: "القيادة وفق النطاق.", notes: "إيقاف القسم ينقل العمل للأرشيف ولا يحذف شيئاً." },
  { name: "سجل الحركة", contains: "من فعل ماذا ومتى ومن أي جهاز.", actions: "التصفية والتصدير Excel أو PDF.", who: "القيادة.", notes: "سجل دائم غير قابل للمسح من الواجهة." },
  { name: "طلبات الاعتماد", contains: "مسار التسلسل الإداري للاعتماد.", actions: "اعتماد، إعادة، رفض.", who: "مديرو العمليات والقيادة.", notes: "الطلب يذهب أولاً لمدير القسم ثم يمكن توجيهه للمستويات الأعلى." },
  { name: "طلبات التسجيل", contains: "قبول أو رفض طلبات الدخول ومنح الدور.", actions: "قبول مع صلاحية أو رفض.", who: "مالك المنصة فقط.", notes: "بعد القبول يُجبر المستخدم على البصمة بعد أول دخول." },
] as const;
