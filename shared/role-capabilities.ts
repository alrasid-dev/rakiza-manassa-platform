// shared/role-capabilities.ts
// سجلّ مركزي للأدوار (CourtRole) وقدراتها (Capability) — مصدر الحقيقة الوحيد.
// القاعدة: القيادة = المالك + court_president + court_secretary + المفوضون.
import { isPlatformOwnerEmail, PLATFORM_OWNER_EMAIL_DEFAULT } from "./login-policy";

/** الأدوار الوظيفية (CourtRole) — 13 دورًا. مصدر الحقيقة الوحيد (يطابق enum قاعدة البيانات). */
export const COURT_ROLES = [
  "court_president",
  "assistant_president",
  "court_secretary",
  "assistant_secretary", // منصب معطّل حتى يُفوَّض (ROLE_CAPABILITIES فارغة)
  "human_resources_manager",
  "department_manager",
  "performance_monitor",
  "trainee_affairs_manager",
  "technical_support_manager",
  "technical_support_agent",
  "administrative_staff",
  "judicial_trainee",
  "judge",
] as const;

export type CourtRole = (typeof COURT_ROLES)[number];

/** القدرات (Capability) — 17 قدرة. */
export type Capability =
  | "manage_operations"
  | "manage_tasks"
  | "manage_hr"
  | "manage_attendance"
  | "view_attendance"
  | "manage_departments"
  | "manage_trainees"
  | "manage_judiciary"
  | "support"
  | "manage_correspondence"
  | "approve"
  | "attach_reports"
  | "view_whole_platform"
  | "delegate"
  | "initiate_asset_request"
  | "manage_asset_requests"
  | "receive_asset_notifications";

/** قدرات عامة يمتلكها كل مستخدم (بدون اشتراط دور). */
export const UNIVERSAL_CAPABILITIES: Capability[] = [
  "initiate_asset_request",
];

/** المالك (بالبريد، مطابقة تامة مع PLATFORM_OWNER_EMAIL) — ليس دورًا، وكل القدرات دائمًا. */
export function isOwner(email: string | null | undefined, ownerEmail = PLATFORM_OWNER_EMAIL_DEFAULT): boolean {
  return isPlatformOwnerEmail(email, ownerEmail);
}

/**
 * خريطة الدور → قدراته.
 * - القيادة (court_president / court_secretary) تملك delegate + view_whole_platform.
 * - assistant_secretary فارغة: يعمل فقط عبر تفويض من الأمين.
 * - HR يرى الحضور ولا يعدّله، ويرفع تقارير سجلات الموظفين.
 * - performance_monitor ليس قيادة: يرفع تقارير فقط.
 */
export const ROLE_CAPABILITIES: Record<CourtRole, Capability[]> = {
  court_president: [
    "manage_operations", "manage_tasks", "manage_hr",
    "view_attendance", // يرى الحضور ولا يعدّله
    "manage_departments", "manage_trainees", "manage_judiciary",
    "support", "manage_correspondence", "approve", "attach_reports",
    "view_whole_platform",
    "delegate",
  ],
  assistant_president: [
    "manage_operations", "manage_tasks", "manage_hr",
    "view_attendance",
    "manage_judiciary", "support", "manage_correspondence", "approve", "attach_reports",
    "view_whole_platform",
  ],
  court_secretary: [
    "manage_operations", "manage_hr",
    "manage_attendance", "view_attendance", // الأمين يعدّل الحضور
    "manage_departments", "manage_judiciary",
    "manage_correspondence", "approve",
    "view_whole_platform",
    "delegate",
    "receive_asset_notifications", // يُشعَر بطلبات العهد
  ],
  assistant_secretary: [], // يعمل فقط عبر تفويض من الأمين
  human_resources_manager: [
    "manage_hr", "view_attendance", "attach_reports",
    "manage_asset_requests", // يقبل/يسند/يعتمد طلبات العهد
  ],
  department_manager: [
    // ⚠️ manage_operations أُزيلت تطبيقاً لقاعدة: القيادة فقط تدير العمليات.
    "manage_tasks", "manage_departments", "manage_correspondence",
  ],
  performance_monitor: [
    "manage_tasks", "attach_reports",
  ],
  trainee_affairs_manager: [
    "manage_trainees", "manage_correspondence",
  ],
  technical_support_manager: ["support"],
  technical_support_agent: ["support"],
  administrative_staff: [],
  judicial_trainee: [],
  judge: [],
};

/** فحص بسيط للقدرة من الأدوار وحدها (بدون تفويض وبدون مالك). */
export function hasRoleCapability(roles: CourtRole[], capability: Capability): boolean {
  return roles.some((role) => ROLE_CAPABILITIES[role]?.includes(capability));
}
