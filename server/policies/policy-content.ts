/**
 * server/policies/policy-content.ts
 * محتوى السياسات التشغيلية حسب الدور والصلاحية، مصدره:
 *  - APPROVED_OPERATIONAL_POLICY.md
 *  - docs/POLICIES_COMPLETE.md
 * يُستخدم لعرض السياسات داخل المنصة أو توليد PDF حسب الدور.
 */

export type PolicyAudience = "all" | "manager" | "secretary" | "president" | "owner";

export type PolicySection = {
  id: string;
  title: string;
  content: string;
  appliesTo: PolicyAudience;
};

/** ترتيب المستويات (الأعلى قيمة = الأوسع صلاحية). */
const AUDIENCE_RANK: Record<PolicyAudience, number> = {
  all: 0,
  manager: 1,
  secretary: 2,
  president: 3,
  owner: 4,
};

const MANAGER_ROLES = [
  "department_manager",
  "human_resources_manager",
  "trainee_affairs_manager",
  "technical_support_manager",
  "court_secretary",
  "assistant_president",
  "court_president",
] as const;

/** أعلى مستوى يبلغه مستخدم بناءً على دوره وصلاحيته. */
export function audienceRankFor(role: string | null | undefined, permission: string | null | undefined): number {
  let rank = AUDIENCE_RANK.all;
  const isOwner = permission === "full_control";
  if (isOwner) return AUDIENCE_RANK.owner;
  if (role === "court_president") rank = Math.max(rank, AUDIENCE_RANK.president);
  if (role === "court_secretary" || role === "assistant_president") rank = Math.max(rank, AUDIENCE_RANK.secretary);
  if (role && (MANAGER_ROLES as readonly string[]).includes(role)) rank = Math.max(rank, AUDIENCE_RANK.manager);
  return rank;
}

export const POLICY_SECTIONS: PolicySection[] = [
  {
    id: "login",
    title: "تسجيل الدخول",
    content:
      "الدخول عبر البريد الرسمي (نطاق moj.gov.sa) أو قناة المالك المعتمدة فقط. يُطلب تغيير كلمة المرور الأولى إجبارياً، مع دعم التحقق بخطوتين (OTP / مفاتيح المرور). أي بريد خارج النطاق الرسمي مرفوض إلا بريد مالك المنصة.",
    appliesTo: "all",
  },
  {
    id: "attendance",
    title: "الحضور والانصراف",
    content:
      "الوردية الأساسية: فتح البصمة 07:00، بداية الدوام 07:30، فتح التأخير 08:00، آخر تعويض 08:15، نهاية الدوام 14:15، آخر خروج 14:45، غلق البصمة 14:59. الحضور: 07:00–07:30 (+1 نقطة)، 07:30–08:00 (0)، 08:00–08:15 (0)، بعد 08:15 (−1 نقطة/ساعة من 07:30). الانصراف: قبل 14:15 انصراف مبكر (يحتاج استئذان)، 14:15–14:59 (+1 نقطة)، وعدم التسجيل (−4 نقاط + خصم 240 دقيقة فوري). لا تُطبَّق عقوبة عدم الانصراف في الجمعة/السبت أو الإجازات الرسمية أو الأيام بدون بصمة دخول أو أيام الإجازة المعتمدة.",
    appliesTo: "all",
  },
  {
    id: "leave_permission",
    title: "الإجازات والاستئذان",
    content:
      "استئذان واحد بحد أقصى 240 دقيقة، والحد الشهري 720 دقيقة. لا استئذانين في نفس اليوم. عدد الاستئذانات دون مشاكل 3 بموافقة المدير المباشر، والرابع فما فوق بموافقة المدير مبدئياً ثم اعتماد الأمين. بعد عدم تسجيل الانصراف يمكن تقديم استئذان متأخر وتسجيل الخروج، ويبقى pending حتى موافقة المدير. الإجازة المعتمدة تستبعد الموظف من التوزيع الآلي وتوقف إسناد المهام الجديدة خلال مدتها.",
    appliesTo: "all",
  },
  {
    id: "tasks",
    title: "المهام والتكليفات",
    content:
      "تبدأ المهمة عند الإسناد أو الاستحقاق (الأقرب)، والمهلة التشغيلية الأولى 6 ساعات عمل، ثم 6 ساعات إضافية قبل الإحالة للمشرف مع مساءلة. تنبيهات قبل الموعد بـ 24 ساعة و12 ساعة. تُؤرشف المهام والمتعثرات مؤقتاً بدل الحذف مع أثر تدقيقي.",
    appliesTo: "all",
  },
  {
    id: "scores_accountability",
    title: "النقاط والمساءلات",
    content:
      "أوزان الأداء: الحضور 20%، الإنجاز 40%، الالتزام 15%، الجودة 15%، المبادرات 10%. النقاط الإيجابية: اعتماد إنجاز +5، بدء مبكر +1، إغلاق تذكرة +3. السلبية: تعثر جديد −3، عدم بدء مهمة −3، عدم تأكيد حضور −1. تُنشأ المساءلة تلقائياً ويُراجعها الدور الحالي أو رئيس المحكمة.",
    appliesTo: "all",
  },
  {
    id: "manage_people",
    title: "إدارة الموظفين",
    content:
      "إضافة وتعديل وأرشفة ملفات الموظفين والملازمين والقضاة ضمن نطاق الصلاحية المفوضة، مع حفظ أثر تدقيقي وبيان سبب كل تغيير. الأرشفة لا تحذف السجل بل توقفه بوسم archived مع حفظ الفاعل والوقت والسبب.",
    appliesTo: "manager",
  },
  {
    id: "approve_permissions",
    title: "اعتماد الاستئذانات",
    content:
      "مراجعة طلبات الإجازة والاستئذان واتخاذ القرار. الاستئذان الرابع فما فوق يتطلب اعتماد الأمين بعد موافقة المدير. أي إجازة معتمدة توقف إسناد المهام الجديدة وتظهر للمدير ضمن سجل الحضور.",
    appliesTo: "manager",
  },
  {
    id: "meetings",
    title: "الاجتماعات والمحاضر",
    content:
      "جدولة الاجتماعات، دعوة الحاضرين ومدراء الأقسام، توثيق المحضر والقرارات، وتحويل القرارات إلى مهام مرتبطة بالاجتماع لمتابعتها وتقييمها في الاجتماع التالي.",
    appliesTo: "manager",
  },
  {
    id: "president_powers",
    title: "صلاحيات رئيس المحكمة",
    content:
      "رئاسة الاعتمادات النهائية للمهام والتسكين، الاطلاع على مؤشرات القيادة، إنشاء وإلغاء التفويض المؤقت للقيادة، والإشراف العام على سير المحكمة ضمن نطاق الصلاحية الممنوحة.",
    appliesTo: "president",
  },
  {
    id: "secretary_powers",
    title: "صلاحيات أمين المحكمة",
    content:
      "إدارة تكليف المدراء، اعتماد الاستئذان الرابع فما فوق، إدارة التكاليف، وتوثيق سجلات المحكمة ومحاضرها. يشارك في الاعتمادات التي تتطلب مستوى الأمين.",
    appliesTo: "secretary",
  },
  {
    id: "owner_powers",
    title: "صلاحيات مالك المنصة",
    content:
      "التحكم الكامل في المنصة: إدارة الوحدات والبرمجيات، طلبات التسجيل وإدارة المستخدمين، تعديل قيم السياسات مع حفظ المنفذ والوقت والقيمة قبل وبعد، والأرشفة الخارجية والنسخ الاحتياطي. لا يجوز للموافقة الآلية تنفيذ جزاء أو قرار وظيفي أو تغيير صلاحية.",
    appliesTo: "owner",
  },
];

/** السياسات المطبقة على مستخدم حسب دوره وصلاحيته. */
export function getPoliciesForRole(role: string | null | undefined, permission: string | null | undefined): PolicySection[] {
  const rank = audienceRankFor(role, permission);
  return POLICY_SECTIONS.filter(section => AUDIENCE_RANK[section.appliesTo] <= rank);
}

/** السياسات المطبقة على مستخدم له عدة أدوار (تؤخذ أعلى صلاحية بينها). */
export function getPoliciesForRoles(roles: Array<string | null | undefined>, permission: string | null | undefined): PolicySection[] {
  let rank = AUDIENCE_RANK.all;
  for (const role of roles) rank = Math.max(rank, audienceRankFor(role, permission));
  return POLICY_SECTIONS.filter(section => AUDIENCE_RANK[section.appliesTo] <= rank);
}
