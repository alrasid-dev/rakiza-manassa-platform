import { useAuth } from "@/_core/hooks/useAuth";
import { IS_PREVIEW_MODE } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Archive,
  AlertTriangle,
  PackageCheck,
  Award,
  BadgeCheck,
  BadgeHelp,
  Building2,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  Clock3,
  CircleCheck,
  FileBarChart2,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Gauge,
  Gavel,
  Handshake,
  Headphones,
  KeyRound,
  Landmark,
  Mail,
  Network,
  ScrollText,
  UserCheck,
  UserCog,
  UserPlus,
  LayoutDashboard,
  Menu,
  Repeat,
  Scale,
  ShieldCheck,
  Settings2,
  UsersRound,
  X,
  Bot,
  Download,
  Files,
  FolderOpen,
  Activity,
  Building,
  Megaphone,
  Moon,
  Sparkles,
  Sun,
  GitBranch,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { toast } from "sonner";
import { PushNotificationPrompt } from "./PushNotificationPrompt";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { NotificationCenter } from "./NotificationCenter";
import { PwaInstallHint } from "./PwaInstallHint";
import { RAKIZA_BRAND, RAKIZA_HEADER, RAKIZA_BRAND_LINE } from "@/branding";
import { Button } from "./ui/button";
import AiRakizaTaskPrompt from "./AiRakizaTaskPrompt";
import AttendanceFirstGate from "./AttendanceFirstGate";
import FirstUseHelp from "./FirstUseHelp";
import PasskeyEnrollmentGate from "./PasskeyEnrollmentGate";
import { useWorkMode } from "./WorkModeToggle";
import CourtEmblem from "./CourtEmblem";
import BackButton from "./BackButton";
import CourtStructureMenu from "./CourtStructureMenu";
import DepartmentManagementActions from "./DepartmentManagementActions";
import DepartmentManagerMenu from "./DepartmentManagerMenu";
import DynamicQuickActions, { quickActionCatalog, type QuickActionId } from "./DynamicQuickActions";

type WorkspacePermission = "full_control" | "general_view" | "employee" | "trainee" | null | undefined;
export type AnnouncementPreview = { id: number; title: string; body: string };

export function announcementPreviewCopy(announcement?: AnnouncementPreview) {
  return announcement
    ? { title: announcement.title, summary: announcement.body, isNew: true }
    : { title: "لا توجد تعاميم جديدة ضمن نطاقك", summary: "افتح اللوحة للاطلاع على كل الإعلانات الرسمية.", isNew: false };
}
type NavigationAudience = "full_control" | "general_view" | "employee" | "trainee";
export function resolveNavigationPermission(permission: WorkspacePermission, hasLeadershipScope: boolean): WorkspacePermission {
  return permission === "full_control" ? "full_control" : hasLeadershipScope ? "general_view" : permission;
}
export function isNavigationSectionAllowed(sectionHeading: string, permission: WorkspacePermission, unitName?: string | null, unitCode?: string | null) {
  const unitText = `${unitName ?? ""} ${unitCode ?? ""}`.toLowerCase();
  const isStaff = permission === "employee" || permission === "trainee";
  return !isStaff || sectionHeading === "لوحة القيادة" || sectionHeading === "العمل والتقارير" || sectionHeading === "الموارد البشرية" || (sectionHeading === "شؤون الملازمين" && /ملازم|trainee/.test(unitText));
}
export const navigationSections: { heading: string; collapsible?: boolean; hideForOwner?: boolean; items: { icon: typeof LayoutDashboard; label: string; path: string; audiences: NavigationAudience[]; ownerOnly?: boolean; leadershipOnly?: boolean; operationsOnly?: boolean }[] }[] = [
  { heading: "لوحة القيادة", items: [{ icon: LayoutDashboard, label: "الرئيسية", path: "/", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: Bot, label: "AI ركيزة", path: "/assistants", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: Megaphone, label: "الإعلانات الداخلية", path: "/announcements", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: AlertTriangle, label: "المتعثرات", path: "/delays", audiences: ["full_control", "general_view", "employee"] }, { icon: BadgeHelp, label: "دليل المستخدم", path: "/guide", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: UserCog, label: "إعدادات الموظف", path: "/personal-settings", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: Settings2, label: "إعدادات المنصة", path: "/platform-settings", audiences: ["full_control", "general_view", "employee", "trainee"] }] },
  { heading: "العمل والتقارير", collapsible: true, items: [{ icon: FileSearch, label: "مراجعة تقييم التقارير", path: "/report-evaluations", audiences: ["full_control", "general_view"] }, { icon: FileBarChart2, label: "التقارير المنفصلة", path: "/reports", audiences: ["full_control", "general_view"] }, { icon: Award, label: "سجل الإنجازات", path: "/achievements", audiences: ["full_control", "general_view", "employee", "trainee"] }] },
  { heading: "رئاسة المحكمة", collapsible: true, items: [{ icon: Landmark, label: "مكتب رئيس المحكمة", path: "/", audiences: ["full_control", "general_view"] }, { icon: Activity, label: "مرصد ضغط العمل", path: "/leadership-workload", audiences: ["full_control", "general_view"], leadershipOnly: true }, { icon: Repeat, label: "المداورة", path: "/rotation", audiences: ["full_control", "general_view"], leadershipOnly: true }, { icon: Gauge, label: "مؤشرات القيادة", path: "/owner-kpi", audiences: ["full_control", "general_view"], leadershipOnly: true }, { icon: Handshake, label: "تفويض", path: "/delegation", audiences: ["full_control", "general_view"], leadershipOnly: true }, { icon: Network, label: "مساعد رئيس المحكمة", path: "/hierarchy", audiences: ["full_control"], ownerOnly: true }, { icon: Building2, label: "أمانة المحكمة", path: "/hierarchy", audiences: ["full_control", "general_view"] }, { icon: Scale, label: "شؤون القضاة", path: "/judges", audiences: ["full_control", "general_view"] }, { icon: Headphones, label: "الدعم التقني", path: "/support", audiences: ["full_control", "general_view", "employee", "trainee"] }] },
  { heading: "شؤون الملازمين", collapsible: true, hideForOwner: true, items: [{ icon: ShieldCheck, label: "تشغيل شؤون الملازمين", path: "/trainees", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: FileSpreadsheet, label: "بيانات Excel للملازمين", path: "/imports", audiences: ["full_control", "general_view"] }, { icon: FileText, label: "قوالب عروض شؤون الملازمين", path: "/trainee-correspondence-templates", audiences: ["full_control", "general_view", "employee"] }] },
  { heading: "الموارد البشرية", collapsible: true, items: [{ icon: UsersRound, label: "الموارد البشرية والموظفون", path: "/people", audiences: ["full_control", "general_view"] }, { icon: Clock3, label: "الحضور والانصراف", path: "/status?tab=attendance", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: CircleCheck, label: "تأكيد الحضور", path: "/status?tab=confirmation", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: CalendarOff, label: "الاستئذان والإجازات", path: "/status", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: PackageCheck, label: "العهد والأصول", path: "/assets", audiences: ["full_control", "general_view", "employee"] }] },
  { heading: "الإدارة والتقارير", collapsible: true, items: [{ icon: BadgeCheck, label: "طلبات الاعتماد", path: "/approvals", audiences: ["full_control", "general_view", "employee", "trainee"] }, { icon: FileBarChart2, label: "التقارير المنفصلة", path: "/reports", audiences: ["full_control", "general_view"] }, { icon: Download, label: "تنزيل بيانات القسم", path: "/data-exports", audiences: ["full_control", "general_view"] }, { icon: ScrollText, label: "سجل الحركة", path: "/activity-log", audiences: ["full_control", "general_view"] }, { icon: Gavel, label: "القرارات والمساءلات", path: "/decisions", audiences: ["full_control", "general_view"] }, { icon: CalendarDays, label: "الاجتماعات والمحاضر", path: "/meetings", audiences: ["full_control", "general_view"] }, { icon: UserPlus, label: "طلبات التسجيل وإدارة المستخدمين", path: "/access-management", audiences: ["full_control"], ownerOnly: true }, { icon: Settings2, label: "وحدات رَكيزة وأيقوناتها", path: "/platform-modules", audiences: ["full_control"], ownerOnly: true }, { icon: KeyRound, label: "تفويض القيادة", path: "/leadership-access", audiences: ["full_control"], ownerOnly: true }, { icon: Network, label: "التسلسل الإداري", path: "/hierarchy", audiences: ["full_control"], ownerOnly: true }, { icon: Archive, label: "الأرشيف", path: "/archive", audiences: ["full_control", "general_view"] }, { icon: Files, label: "قوالب مراسلات القسم", path: "/department-templates", audiences: ["full_control", "general_view"] }, { icon: FolderOpen, label: "مستندات القسم", path: "/department-documents", audiences: ["full_control", "general_view", "employee"], operationsOnly: true }, { icon: GitBranch, label: "مخطط سير العمل", path: "/workflow-map", audiences: ["full_control", "general_view"], operationsOnly: true }] },
];

export type NavigationIconTone = "olive" | "gold" | "alert";

export function navigationIconTone(sectionHeading: string, label: string): NavigationIconTone {
  if (label === "المتعثرات" || label === "القرارات والمساءلات" || label === "الإشعارات") return "alert";
  if (sectionHeading === "رئاسة المحكمة" || label === "تفويض القيادة" || label === "مؤشرات القيادة") return "gold";
  return "olive";
}

export function isNavigationPathActive(location: string, path: string) {
  const current = location.split("?")[0] || "/";
  const target = path.split("?")[0] || "/";
  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
}

export function navigationIconWellClass(tone: NavigationIconTone, active: boolean, variant: "light" | "dark") {
  if (tone === "alert") {
    return variant === "dark"
      ? (active ? "bg-[#8f2a22] text-[#ffe1da]" : "bg-[#5c221c] text-[#ffb4a6] group-hover:bg-[#8f2a22] group-hover:text-[#ffe1da]")
      : (active ? "bg-[#f5c4bb] text-[#b51f2b]" : "bg-[#fde4df] text-[#c83b3b] group-hover:bg-[#f5c4bb] group-hover:text-[#b51f2b]");
  }
  if (tone === "gold") {
    return variant === "dark"
      ? (active ? "bg-[#4a3d1f] text-[#ead69c]" : "bg-[#2f2a18] text-[#d4c08a] group-hover:bg-[#4a3d1f] group-hover:text-[#ead69c]")
      : (active ? "bg-[#efe4c0] text-[#80642b]" : "bg-[#f6f0df] text-[#8a6e32] group-hover:bg-[#efe4c0]");
  }
  return variant === "dark"
    ? (active ? "bg-[#1f7a4d] text-[#f0f9ef]" : "bg-[#1a4d38] text-[#b6e0b0] group-hover:bg-[#1f7a4d] group-hover:text-[#f0f9ef]")
    : (active ? "bg-[#c5e6c8] text-[#14633d]" : "bg-[#d9eedc] text-[#1f7a4d] group-hover:bg-[#c5e6c8] group-hover:text-[#14633d]");
}

export function navigationIconForPath(path: string) {
  const target = path.split("?")[0] || "/";
  for (const section of navigationSections) {
    const item = section.items.find(candidate => isNavigationPathActive(target, candidate.path) || candidate.path.split("?")[0] === target);
    if (item) return { icon: item.icon, tone: navigationIconTone(section.heading, item.label), label: item.label };
  }
  return null;
}

export const oliveIconMotionClass = "rakiza-olive-icon";

/**
 * يستخرج معرّف محادثة القسم من رد الخادم، ويتحمّل أي شكل غير متوقع (غير مصفوفة أو صفوف ناقصة)
 * بدل إسقاط لوحة القيادة بخطأ تشغيل.
 */
export function resolveDepartmentConversationId(rows: unknown): number | null {
  if (!Array.isArray(rows)) return null;
  const match = (rows as Array<{ conversation?: { id?: number; conversationType?: string } }>)
    .find(row => row?.conversation?.conversationType === "department");
  const id = match?.conversation?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/** يقرأ تفضيلات ترتيب/إخفاء إجراءات لوحة القيادة بأمان من أي قيمة محفوظة. */
export function normalizeQuickActionIds(value: unknown): QuickActionId[] {
  const knownIds = quickActionCatalog.map(entry => entry.id) as string[];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is QuickActionId => typeof item === "string" && knownIds.includes(item));
}

export function navigationBadgeForItem(label: string, counts: { mail: number; chat: number; taskAttention: number; pendingApprovals: number }) {
  const count = label === "بريد ركيزة" ? counts.mail : label === "الدردشات" ? counts.chat : label === "مهامي" ? counts.taskAttention : label === "طلبات الاعتماد" ? counts.pendingApprovals : 0;
  const accessibleLabel = label === "الدردشات" ? `${count} رسالة دردشة غير مقروءة` : label === "مهامي" ? `${count} مهام تتطلب متابعة` : label === "طلبات الاعتماد" ? `${count} طلبات اعتماد معلقة` : `${count} رسالة غير مقروءة`;
  return { count, accessibleLabel };
}

export function activityStateLabel(activityState: "active" | "chatting" | "inactive") {
  return activityState === "active" ? "يعمل على المنصة" : activityState === "chatting" ? "مشغول بمحادثة" : "غير نشط";
}

function playRecommendationTone() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
    window.setTimeout(() => void context.close(), 350);
  } catch { /* قد يمنع المتصفح الصوت قبل تفاعل المستخدم، ولا نعطل الإشعار المرئي */ }
}

function formatLastSeen(value: Date | string | number | null | undefined) {
  if (!value) return "لم يُسجل نشاط بعد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "لم يُسجل نشاط بعد";
  return `آخر ظهور ${date.toLocaleDateString("ar-SA")} · ${date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
}

function CourtMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#2d6b4f] text-[#f5f7ef] shadow-[0_8px_18px_rgba(41,91,66,0.16)]">
        <CourtEmblem className={`h-6 w-6 ${oliveIconMotionClass}`} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black tracking-tight text-[#245f43] sm:text-3xl">{RAKIZA_BRAND_LINE}</p>
        <p className="mt-0.5 text-[11px] font-medium text-[#718078]">الرياض · متابعة يومية آمنة</p>
      </div>
    </div>
  );
}

function NavigationMenu({ onNavigate, permission, isOwner, unitName, unitCode, variant = "light", navigationPreferences, mailUnreadCount = 0, chatUnreadCount = 0, taskAttentionCount = 0, pendingApprovalCount = 0, leadershipRoles = [], workMode = "manager" }: { onNavigate?: () => void; permission: WorkspacePermission; isOwner: boolean; unitName?: string | null; unitCode?: string | null; variant?: "light" | "dark"; navigationPreferences?: { navigationOrder: string[]; hiddenNavigationLabels: string[] }; mailUnreadCount?: number; chatUnreadCount?: number; taskAttentionCount?: number; pendingApprovalCount?: number; leadershipRoles?: string[]; workMode?: "employee" | "manager" }) {
  const [location, setLocation] = useLocation();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ "لوحة القيادة": true, "العمل والتقارير": true, "الموارد البشرية": true, "تسلسل الأقسام": true });

  return (
    <nav aria-label="التنقل الرئيسي" className="space-y-3">
      {navigationSections.filter(section => !(section.hideForOwner && isOwner)).map(section => {
        const sectionAllowed = isNavigationSectionAllowed(section.heading, permission, unitName, unitCode);
        const permittedItems = sectionAllowed ? section.items.filter(item => (IS_PREVIEW_MODE || item.audiences.includes(permission || "general_view")) && (!item.ownerOnly || isOwner) && (!item.leadershipOnly || (workMode !== "employee" && leadershipRoles.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary"))) && (!item.operationsOnly || isOwner || leadershipRoles.some(role => ["court_president", "assistant_president", "court_secretary", "human_resources_manager", "department_manager", "performance_monitor", "trainee_affairs_manager"].includes(role)))) : [];
        const orderedNavigationItems = section.heading === "لوحة القيادة" && navigationPreferences ? navigationPreferences.navigationOrder.reduce<typeof permittedItems>((items, label) => {
          const item = permittedItems.find(candidate => candidate.label === label);
          if (item && !navigationPreferences.hiddenNavigationLabels.includes(item.label)) items.push(item);
          return items;
        }, []) : permittedItems;
        const visibleItems = section.heading === "لوحة القيادة" && navigationPreferences ? [
          ...orderedNavigationItems,
          ...permittedItems.filter(item => !navigationPreferences.navigationOrder.includes(item.label) && !navigationPreferences.hiddenNavigationLabels.includes(item.label)),
        ] : permittedItems;
        if (!visibleItems.length) return null;
        const isOpen = !section.collapsible || Boolean(openSections[section.heading]);
        return (
        <section key={section.heading} aria-label={section.heading}>
          <button type="button" onClick={() => section.collapsible && setOpenSections(current => ({ ...current, [section.heading]: !current[section.heading] }))} className={`mb-1.5 flex w-full items-center justify-between px-2.5 text-right text-[11px] font-bold tracking-[0.08em] ${variant === "dark" ? "text-[#c2d6c5]/70 hover:text-[#eaf3e9]" : "text-[#75847b] hover:text-[#245f43]"} ${section.collapsible ? "cursor-pointer" : "cursor-default"}`} aria-expanded={section.collapsible ? isOpen : undefined}>
            <span>{section.heading}</span>{section.collapsible && <span aria-hidden="true" className="text-base leading-none">{isOpen ? "−" : "+"}</span>}
          </button>
          {isOpen && <div className="space-y-1">
            {visibleItems.map(item => {
              const active = isNavigationPathActive(location, item.path);
              const tone = navigationIconTone(section.heading, item.label);
              const { count: unreadCount, accessibleLabel: unreadLabel } = navigationBadgeForItem(item.label, { mail: mailUnreadCount, chat: chatUnreadCount, taskAttention: taskAttentionCount, pendingApprovals: pendingApprovalCount });
              const iconSize = item.label === "بريد ركيزة" ? "h-5 w-5" : "h-[1.15rem] w-[1.15rem]";
              return (
                <button key={`${item.path}-${item.label}`} type="button" onClick={() => { setLocation(item.path); onNavigate?.(); }} className={["group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-right text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78a886]", variant === "dark" ? (active ? "border-r-2 border-[#a8c98f] bg-[#1f6147] text-white shadow-[0_6px_16px_rgba(20,69,48,0.2)" : "text-white/85 hover:bg-[#214c3d] hover:text-white") : (active ? "border-r-2 border-[#7faa82] bg-[#e0ecdf] text-[#245f43] shadow-[0_5px_14px_rgba(50,94,68,0.09)]" : "text-[#4f6258] hover:bg-[#e9eee7] hover:text-[#245f43]")].join(" ")}>
                  <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${navigationIconWellClass(tone, active, variant)}`}><item.icon className={`${iconSize} ${oliveIconMotionClass}`} fill={active ? "currentColor" : "none"} strokeWidth={active ? 1.6 : 2} /></span>
                  <span>{item.label}</span>
                  {unreadCount > 0 && <span aria-label={unreadLabel} className={`mr-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${variant === "dark" ? "bg-[#b6d3aa] text-[#173c2d]" : "bg-[#b84d3e] text-white"}`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
                </button>
              );
            })}
            {section.heading === "لوحة القيادة" && (permission === "full_control" || leadershipRoles.some(role => ["court_president", "assistant_president", "court_secretary"].includes(role))) && <CourtStructureMenu variant="tile" />}
          </div>}
        </section>
        );
      })}
    </nav>
  );
}

export default function DashboardLayout({ children, hideUtilityPrompts = false, dashboardCustomization, navigationPreferences }: { children: React.ReactNode; hideUtilityPrompts?: boolean; dashboardCustomization?: React.ReactNode; navigationPreferences?: { navigationOrder: string[]; hiddenNavigationLabels: string[] } }) {
  const [location, setLocation] = useLocation();
  const { loading, user, logout } = useAuth({ disabled: IS_PREVIEW_MODE });
  const permission = trpc.court.registration.myPermission.useQuery(undefined, { enabled: Boolean(user) || IS_PREVIEW_MODE });
  const roles = trpc.court.myRoles.useQuery(undefined, { enabled: Boolean(user) || IS_PREVIEW_MODE });
  const notifications = trpc.court.notifications.listMine.useQuery(undefined, { enabled: Boolean(user) && !IS_PREVIEW_MODE });
  const currentProfile = trpc.court.people.self.useQuery(undefined, { enabled: Boolean(user) && !IS_PREVIEW_MODE });
  const internalMailProcedure = (trpc.court as any).internalMail?.folderCounts;
  const internalMailCounts = internalMailProcedure?.useQuery ? internalMailProcedure.useQuery(undefined, { enabled: Boolean(user) && !IS_PREVIEW_MODE, refetchInterval: 30_000 }) : { data: { unread: 0 } };
  const chatUnreadProcedure = (trpc.court as any).communications?.conversations?.unreadCount;
  const chatUnread = chatUnreadProcedure?.useQuery ? chatUnreadProcedure.useQuery(undefined, { enabled: Boolean(user) && !IS_PREVIEW_MODE, refetchInterval: 30_000 }) : { data: 0 };
  const conversationsProcedure = (trpc.court as any).communications?.conversations?.list;
  const conversations = conversationsProcedure?.useQuery ? conversationsProcedure.useQuery(undefined, { enabled: Boolean(user) && !IS_PREVIEW_MODE }) : { data: [] as Array<{ conversation: { id: number; conversationType: string } }> };
  // حماية صريحة: شكل رد الخادم قد يتغيّر أو يعود بغير مصفوفة، فلا نُسقط لوحة القيادة بسبب ذلك.
  const departmentConversationId = resolveDepartmentConversationId(conversations.data);
  const dashboardPreferencesProcedure = (trpc.court as any).dashboardPreferences?.mine;
  const savedDashboardPreferences = dashboardPreferencesProcedure?.useQuery ? dashboardPreferencesProcedure.useQuery(undefined, { enabled: Boolean(user) && !IS_PREVIEW_MODE }) : { data: undefined as { quickActionOrder?: string[]; hiddenQuickActionIds?: string[] } | undefined };
  const quickActionOrder = normalizeQuickActionIds(savedDashboardPreferences.data?.quickActionOrder);
  const hiddenQuickActionIds = normalizeQuickActionIds(savedDashboardPreferences.data?.hiddenQuickActionIds);
  const taskListProcedure = (trpc.court as any).tasks?.list;
  const assignedTasks = taskListProcedure?.useQuery ? taskListProcedure.useQuery(undefined, { enabled: Boolean(user) && !IS_PREVIEW_MODE, refetchInterval: 60_000 }) : { data: [] as Array<{ id: number; title: string; dueAt?: Date | string | number; status?: string }> };
  const operationsRoles = ["court_president", "assistant_president", "court_secretary", "human_resources_manager", "department_manager", "performance_monitor", "trainee_affairs_manager"];
  const mayManageOperations = permission.data === "full_control" || (roles.data ?? []).some(role => operationsRoles.includes(role));
  const pendingApprovalsProcedure = (trpc.court as any).approvals?.pending;
  const pendingApprovals = pendingApprovalsProcedure?.useQuery ? pendingApprovalsProcedure.useQuery(undefined, { enabled: Boolean(user) && !IS_PREVIEW_MODE && mayManageOperations, refetchInterval: 30_000 }) : { data: [] };
  const taskAttentionCount = (assignedTasks.data || []).filter((task: { status?: string }) => ["new", "in_progress", "under_review", "overdue"].includes(task.status || "")).length;
  const acknowledgeTaskProcedure = (trpc.court as any).tasks?.acknowledge;
  const acknowledgeTask = acknowledgeTaskProcedure?.useMutation ? acknowledgeTaskProcedure.useMutation({ onSuccess: () => { void assignedTasks.refetch?.(); toast.success("تم تسجيل بدء المهمة."); } }) : { mutate: () => undefined, isPending: false };
  const announcementsProcedure = trpc.court.announcements?.list;
  const announcements = announcementsProcedure?.useQuery ? announcementsProcedure.useQuery(undefined, { enabled: Boolean(user) || IS_PREVIEW_MODE }) : { data: [] as Array<{ id: number; title: string; body: string }> };
  const utils = trpc.useUtils();
  const departmentIdentityProcedure = (trpc.court as any).departmentIdentity;
  const departmentIdentity = departmentIdentityProcedure?.available?.useQuery ? departmentIdentityProcedure.available.useQuery(undefined, { enabled: Boolean(user) && !IS_PREVIEW_MODE }) : { data: null };
  const switchDepartmentIdentity = departmentIdentityProcedure?.switch?.useMutation ? departmentIdentityProcedure.switch.useMutation({
    onSuccess: async (result: { selectedIdentity: "department_account" | "personal" }) => {
      await Promise.all([utils.court.people.self.invalidate(), (utils.court as any).departmentIdentity?.available.invalidate(), utils.court.myRoles.invalidate()]);
      toast.success(result.selectedIdentity === "department_account" ? "أنت تعمل الآن بهوية القسم." : "عُدت إلى هويتك الشخصية.");
    },
    onError: (error: { message?: string }) => toast.error(error.message || "تعذر تبديل الهوية."),
  }) : { mutate: () => undefined, isPending: false };
  const activityProcedure = trpc.court.notifications.activity;
  const recordActivity = activityProcedure?.useMutation ? activityProcedure.useMutation({ onSuccess: () => utils.court.people.self.invalidate() }) : { mutate: (_input: { activityState: "active" | "chatting" | "inactive" }) => undefined };
  const [localActivityState, setLocalActivityState] = useState<"active" | "chatting" | "inactive" | null>(null);
  useEffect(() => {
    if (!user || IS_PREVIEW_MODE) return;
    const currentActivity = () => location.startsWith("/messages") ? "chatting" as const : "active" as const;
    const sendActivity = (activityState: "active" | "chatting" | "inactive") => { setLocalActivityState(activityState); recordActivity.mutate({ activityState }); };
    sendActivity(currentActivity());
    const interval = window.setInterval(() => sendActivity(document.hidden ? "inactive" : currentActivity()), 30_000);
    const onVisibilityChange = () => sendActivity(document.hidden ? "inactive" : currentActivity());
    const onUserInteraction = () => { if (!document.hidden) sendActivity(currentActivity()); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pointerdown", onUserInteraction, { passive: true });
    window.addEventListener("keydown", onUserInteraction, { passive: true });
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibilityChange); window.removeEventListener("pointerdown", onUserInteraction); window.removeEventListener("keydown", onUserInteraction); };
  }, [user?.id, location]);
  const markNotificationRead = trpc.court.notifications.markRead.useMutation({ onSuccess: () => utils.court.notifications.listMine.invalidate() });
  const hasLeadershipScope = roles.data?.some(role => role === "court_president" || role === "assistant_president" || role === "court_secretary") ?? false;
  const workMode = useWorkMode(hasLeadershipScope);
  const navigationPermission = resolveNavigationPermission(permission.data, hasLeadershipScope && workMode !== "employee");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [attendanceGateBlocking, setAttendanceGateBlocking] = useState(true);
  const { theme, toggleTheme } = useTheme();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [recommendationSoundEnabled, setRecommendationSoundEnabled] = useState(true);
  useEffect(() => {
    setRecommendationSoundEnabled(window.localStorage.getItem("rakiza:recommendation-sound") !== "off");
  }, []);
  const displayedActivityState = localActivityState ?? currentProfile.data?.activityState ?? "inactive";
  const unreadNotifications = notifications.data?.filter(notification => !notification.isRead) ?? [];
  const unreadRecommendations = unreadNotifications.filter(notification => notification.category === "performance_recommendation");
  const previousMailUnread = useRef<number | null>(null);
  useEffect(() => {
    const count = Number(internalMailCounts.data?.unread || 0);
    if (previousMailUnread.current !== null && count > previousMailUnread.current) toast.info("وصلت رسالة جديدة في بريد ركيزة", { description: `لديك الآن ${count} رسالة غير مقروءة.` });
    previousMailUnread.current = count;
  }, [internalMailCounts.data?.unread]);
  const previousChatUnread = useRef<number | null>(null);
  useEffect(() => {
    const count = Number(chatUnread.data || 0);
    if (previousChatUnread.current !== null && count > previousChatUnread.current) toast.info("وصلتك رسالة دردشة جديدة", { description: `لديك الآن ${count} رسالة دردشة غير مقروءة.` });
    previousChatUnread.current = count;
  }, [chatUnread.data]);
  const announcementPreview = announcements.data?.[0] as AnnouncementPreview | undefined;
  const announcementCopy = announcementPreviewCopy(announcementPreview);
  const seenNotificationIds = useRef<Set<number> | null>(null);
  useEffect(() => {
    const current = notifications.data ?? [];
    if (!current.length) return;
    const previous = seenNotificationIds.current;
    const currentIds = new Set(current.map(notification => notification.id));
    seenNotificationIds.current = currentIds;
    if (!previous) return;
    const newRecommendation = current.find(notification => notification.category === "performance_recommendation" && !previous.has(notification.id));
    if (!newRecommendation) return;
    toast.info("وصلتك توصية جديدة لتحسين الإنجاز", { description: newRecommendation.body, duration: 7000 });
    if (recommendationSoundEnabled) playRecommendationTone();
  }, [notifications.data, recommendationSoundEnabled]);

  if (loading) {
    return (
      <div dir="rtl" style={{ fontFamily: "var(--rakiza-font-family, Tajawal, sans-serif)" }}>
        <DashboardLayoutSkeleton />
      </div>
    );
  }

  if (!user && !IS_PREVIEW_MODE) {
    return (
      <div dir="rtl" className="rakiza-theme-root grid min-h-screen place-items-center bg-[var(--rakiza-canvas)] p-5" style={{ fontFamily: "var(--rakiza-font-family, Tajawal, sans-serif)" }}>
        <section className="w-full max-w-md rounded-[2rem] border border-[#e8e1d2] bg-white p-8 text-center shadow-[0_24px_70px_rgba(34,54,46,0.12)]">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-[#12352f] text-[#f1d794]">
            <CourtEmblem className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-bold text-[#12352f]">بوابة {RAKIZA_BRAND} الداخلية</h1>
          <p className="mt-3 text-sm leading-7 text-[#66756d]">يدخل الموظف المعتمد برمز تحقق إلى البريد الرسمي، ويمكن للموظف الجديد إرسال طلب تسجيل دون إنشاء حساب Manus.</p>
          <Button onClick={() => setLocation("/login")} className="mt-7 w-full bg-[#12352f] py-6 text-base hover:bg-[#1e5045]">
            الدخول المستقل إلى رَكيزة
          </Button>
          <button type="button" onClick={() => setLocation("/register")} className="mt-3 w-full rounded-xl border border-[#d9e4d7] px-4 py-3 text-sm font-bold text-[#397057] hover:bg-[#f3f8f2]">
            طلب تسجيل جديد
          </button>
          <button type="button" onClick={() => setLocation("/recover")} className="mt-2 w-full rounded-xl px-4 py-2 text-sm font-bold text-[#718078] hover:text-[#245f43]">
            استعادة الدخول
          </button>
        </section>
      </div>
    );
  }

  return (
    <div dir="rtl" className="rakiza-theme-root min-h-screen overflow-x-hidden bg-[var(--rakiza-canvas)] text-[var(--rakiza-ink)]" style={{ fontFamily: "var(--rakiza-font-family, Tajawal, sans-serif)" }}>
      <div dir="ltr" className="mx-auto min-h-screen w-full max-w-[1800px] overflow-x-hidden lg:flex">
        <main dir="rtl" className="w-full min-w-0 px-4 pb-8 pt-4 sm:px-7 sm:pt-6 lg:flex-1 lg:px-8 lg:pt-5">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rakiza-border)] bg-[var(--rakiza-surface)] px-3 py-3 shadow-[0_4px_16px_rgba(35,63,50,0.04)] sm:mb-7 sm:gap-3 sm:px-5 lg:mb-6 lg:min-h-[5.6rem] lg:flex-nowrap">
            <div dir="rtl" className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="فتح القائمة"
                onClick={() => setMobileOpen(true)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#cfd7ca] bg-[#f2f3ed] text-[#245f43] lg:hidden"
              >
                <Menu className={`h-5 w-5 ${oliveIconMotionClass}`} aria-hidden="true" />
              </button>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#2d6b4f] text-[#f5f7ef] shadow-[0_7px_16px_rgba(45,107,79,0.16)]" aria-label="شعار رَكيزة">
                <CourtEmblem className={`h-6 w-6 ${oliveIconMotionClass}`} />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-black text-[#244637]">رَكيزة <span className="font-semibold text-[#527064]">· {currentProfile.data?.unitName || "المحكمة العمالية بالرياض"}</span></p>
                <p className="mt-1 truncate text-xs font-semibold text-[#748078]">مساحة العمل الآمنة</p>
              </div>
            </div>
            <button type="button" onClick={() => setLocation("/announcements")} className="order-3 flex w-full min-w-0 items-center gap-3 rounded-xl border border-[#d2d9cf] bg-[#f1f2ec] px-3 py-2.5 text-right transition hover:bg-[#e5ece2] md:order-none md:flex-1 lg:max-w-[34rem]" aria-label="لوحة التعاميم والإعلانات">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#dce9da] text-[#2d6b4f]"><Megaphone className={`h-4 w-4 ${oliveIconMotionClass}`} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="text-[11px] font-black text-[#315348]">لوحة التعاميم والإعلانات</span>{announcementCopy.isNew ? <span className="rounded-full bg-[#e0eadf] px-1.5 py-0.5 text-[9px] font-black text-[#2d6b4f]">جديد</span> : null}</span><span className="mt-1 block truncate text-xs font-bold text-[#365548]">{announcementCopy.title}</span><span className="mt-0.5 hidden truncate text-[10px] text-[#748078] sm:block">{announcementCopy.summary}</span></span>
              <ArrowLeft className="h-4 w-4 shrink-0 text-[#698075]" aria-hidden="true" />
            </button>
            <div dir="ltr" className="rakiza-toolbar relative flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-3">
              {toggleTheme && <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "التبديل إلى النمط الفاتح" : "التبديل إلى النمط الداكن"} title={theme === "dark" ? "النمط الفاتح" : "النمط الداكن"} aria-pressed={theme === "dark"} data-testid="theme-toggle" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#cfd7ca] bg-[#f1f3ed] text-[#2d6b4f] transition-colors hover:bg-[#e0ecdf] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78a886]">{theme === "dark" ? <Sun className={`h-4 w-4 ${oliveIconMotionClass}`} aria-hidden="true" /> : <Moon className={`h-4 w-4 ${oliveIconMotionClass}`} aria-hidden="true" />}</button>}
              <div dir="rtl" className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 text-right">
                  <p className="max-w-44 truncate text-xs font-bold text-[#284239]">{user?.name || "وضع المعاينة"}</p>
                  <p className="mt-0.5 max-w-44 truncate text-[11px] text-[#77867d]">{user?.email || "بيانات مصدر مستوردة · معاينة"}</p>
                  <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] font-semibold text-[#718078]" title={formatLastSeen(currentProfile.data?.lastActiveAt)}>
                    <span className={`h-2 w-2 rounded-full ${displayedActivityState === "active" ? "bg-[#16834b]" : displayedActivityState === "chatting" ? "bg-[#b18448]" : "bg-[#b64d3d]"}`} aria-hidden="true" />
                    <span>{activityStateLabel(displayedActivityState)}</span>
                    <span className="sr-only">{formatLastSeen(currentProfile.data?.lastActiveAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          </header>
          {notificationsOpen && <NotificationCenter notifications={notifications.data} isLoading={notifications.isLoading} unreadCount={unreadNotifications.length} onClose={() => setNotificationsOpen(false)} onMarkRead={notificationId => markNotificationRead.mutate({ notificationId })} onOpenTask={(taskId, notificationId, isRead) => { if (!isRead) markNotificationRead.mutate({ notificationId }); setNotificationsOpen(false); setLocation(`/tasks?taskId=${taskId}`); }} onOpenConversation={(conversationId, notificationId, isRead) => { if (!isRead) markNotificationRead.mutate({ notificationId }); setNotificationsOpen(false); setLocation(`/messages?conversationId=${conversationId}`); }} />}
          {!hideUtilityPrompts && <PwaInstallHint alwaysVisible />}
          {!IS_PREVIEW_MODE && user && <PasskeyEnrollmentGate officialEmail={user.email} />}
          {!IS_PREVIEW_MODE && user && <AttendanceFirstGate onComplete={() => window.setTimeout(() => undefined, 0)} onBlockingChange={({ isBlocking }) => setAttendanceGateBlocking(isBlocking)} />}
          {!IS_PREVIEW_MODE && user && <AiRakizaTaskPrompt tasks={assignedTasks.data || []} unreadMailCount={internalMailCounts.data?.unread || 0} urgentUnreadMailCount={internalMailCounts.data?.urgentUnread || 0} unreadNotificationCount={unreadNotifications.length} suppressAutoPrompt={attendanceGateBlocking} onStart={task => setLocation(`/tasks?task=${task.id}`)} onOpenAssistant={() => setLocation("/assistants")} onOpenMail={() => setLocation("/rakiza-mail")} onOpenNotifications={() => setLocation("/notifications")} />}
          <FirstUseHelp />
          {children}
        </main>

        <aside dir="rtl" className="rakiza-sidebar hidden w-[15.5rem] shrink-0 bg-sidebar px-4 py-6 text-sidebar-foreground shadow-[-8px_0_22px_rgba(18,53,47,0.12)] lg:block">
          <div className="sticky top-5 flex min-h-[calc(100vh-2.5rem)] flex-col">
            <div className="border-b border-white/10 pb-6 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#eff4ec] text-[#2d6b4f] shadow-[0_10px_30px_rgba(0,0,0,0.16)]"><CourtEmblem className={`h-9 w-9 ${oliveIconMotionClass}`} /></div>
              <p className="mt-3 text-xl font-black">لوحة القيادة</p>
              <p className="mt-1 text-sm text-white/70">{currentProfile.data?.unitName || "وحدة شؤون الملازمين"}</p>
            </div>
            {dashboardCustomization && <div className="mt-5">{dashboardCustomization}</div>}
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-white/60">أدوات مساندة</span>
                {unreadRecommendations.length > 0 ? <button type="button" aria-label={`${unreadRecommendations.length} توصية جديدة`} onClick={() => setNotificationsOpen(!notificationsOpen)} className="relative grid h-8 w-8 place-items-center rounded-lg text-white/85 transition hover:bg-white/10">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span aria-hidden="true" className="absolute -left-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#b18448] px-1 text-[9px] font-bold text-[#1c2b23]">{unreadRecommendations.length > 9 ? "9+" : unreadRecommendations.length}</span>
                </button> : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[#eaf2e6]"><BackButton /></div>
              {departmentIdentity.data?.identities.length ? <label className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2 py-1.5 text-[10px] font-bold text-white/85"><Building className="h-3.5 w-3.5 shrink-0 text-[#a8c98f]" /><span className="sr-only">الهوية الفعالة</span><select aria-label="الهوية الفعالة" disabled={switchDepartmentIdentity.isPending} value={departmentIdentity.data.activeAccountId?.toString() ?? "personal"} onChange={event => switchDepartmentIdentity.mutate({ departmentAccountId: event.target.value === "personal" ? null : Number(event.target.value) })} className="min-w-0 bg-transparent text-[10px] font-bold text-white/90 outline-none"><option className="text-[#12352f]" value="personal">هويتي الشخصية</option>{departmentIdentity.data.identities.map((identity: { account: { id: number; displayName: string } }) => <option className="text-[#12352f]" key={identity.account.id} value={identity.account.id}>{identity.account.displayName}</option>)}</select></label> : null}
            </div>
            <div className="mt-6"><NavigationMenu variant="dark" permission={navigationPermission} isOwner={(user?.email ?? "").trim().toLowerCase() === "rakizaplatform@gmail.com"} unitName={currentProfile.data?.unitName} unitCode={currentProfile.data?.unitCode} navigationPreferences={navigationPreferences} mailUnreadCount={Number(internalMailCounts.data?.unread || 0)} chatUnreadCount={Number(chatUnread.data || 0)} taskAttentionCount={taskAttentionCount} pendingApprovalCount={Number(pendingApprovals.data?.length || 0)} leadershipRoles={roles.data ?? []} workMode={workMode} /></div>
            <DepartmentManagementActions variant="dark" />
            <DepartmentManagerMenu variant="dark" />
            <div className="mt-auto border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 text-xs font-bold text-white/80"><ShieldCheck className={`h-4 w-4 text-[#a8c98f] ${oliveIconMotionClass}`} /> جلسة محمية</div>
              <p className="mt-2 text-xs leading-5 text-white/55">{IS_PREVIEW_MODE ? "وضع معاينة مؤقت." : "سجل التدقيق مفعّل."}</p>
              {!IS_PREVIEW_MODE && <button type="button" onClick={logout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-xs font-bold text-white/85 transition hover:bg-white/10"><Building2 className="h-4 w-4" /> تسجيل الخروج</button>}
            </div>
          </div>
        </aside>
      </div>


      {mobileOpen && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-[#10271f]/35 backdrop-blur-sm" />
          <aside className="absolute right-0 top-0 h-full w-[min(22rem,92vw)] overflow-y-auto bg-[var(--rakiza-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] shadow-[-20px_0_55px_rgba(18,53,47,0.18)]">
            <div className="flex items-center justify-between">
              <CourtMark />
              <button type="button" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-[#486455] hover:bg-[#dce9da]"><X className="h-5 w-5" /></button>
            </div>
            {dashboardCustomization && <div className="mt-7">{dashboardCustomization}</div>}
            <div className="mt-4 flex flex-wrap items-center gap-1.5"><BackButton /></div>
            <div className="mt-7"><NavigationMenu onNavigate={() => setMobileOpen(false)} permission={navigationPermission} isOwner={(user?.email ?? "").trim().toLowerCase() === "rakizaplatform@gmail.com"} unitName={currentProfile.data?.unitName} unitCode={currentProfile.data?.unitCode} navigationPreferences={navigationPreferences} mailUnreadCount={Number(internalMailCounts.data?.unread || 0)} chatUnreadCount={Number(chatUnread.data || 0)} taskAttentionCount={taskAttentionCount} pendingApprovalCount={Number(pendingApprovals.data?.length || 0)} leadershipRoles={roles.data ?? []} workMode={workMode} /></div>
            <DepartmentManagementActions variant="light" />
            {!IS_PREVIEW_MODE && <button type="button" onClick={logout} className="mt-8 flex w-full items-center gap-2 rounded-xl bg-[#f4ede6] px-3 py-3 text-sm font-bold text-[#784b3f]"><Building2 className="h-4 w-4" /> تسجيل الخروج</button>}
          </aside>
        </div>
      )}
    </div>
  );
}
