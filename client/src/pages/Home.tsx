import DashboardLayout from "@/components/DashboardLayout";
import { DASHBOARD_HOME_CARD_IDS, DashboardCustomizationDialog, defaultDashboardPreferences, normalizeDashboardPreferences, type DashboardHomeCardId, type DashboardPreferenceState } from "@/components/DashboardCustomizationDialog";
import GlobalSearchBar from "@/components/GlobalSearchBar";
import { trpc } from "@/lib/trpc";
import { readDashboardPreferencesLocal, writeDashboardPreferencesLocal } from "@/lib/dashboard-preferences-storage";
import { AlertTriangle, BadgeHelp, BellRing, Bot, CheckCircle2, Clock3, Eye, EyeOff, FileUp, GripVertical, LayoutDashboard, ListChecks, Mail, Megaphone, MessageSquare, Network, Repeat, RotateCcw, Settings2, TrendingUp, UserCog } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Metrics = { scope?: "unit"; profiles?: number; templates?: number; openDelays?: number; overdueDelays?: number; dueTasks?: number; openTasks?: number; overdueTasks?: number; unreadNotifications?: number };
type DashboardTaskFilter = "all" | "overdue" | "due_soon" | "completed";
type DashboardTask = { id: number; title: string; status: string; priority?: "normal" | "high" | "critical"; dueAt: Date | string | number; scheduledAt?: Date | string | number | null; scheduledFor?: Date | string | number | null; assigneeProfileId?: number | null; unitName?: string | null; description?: string | null };
type TeamMember = { id: number; fullName: string; jobTitle?: string | null; unitName?: string | null; status?: "active" | "on_leave" | "inactive" | "pending_review" };

export function dashboardTaskVisualState(task: DashboardTask, now = Date.now()): "completed" | "overdue" | "due_soon" | "normal" {
  if (task.status === "completed") return "completed";
  const dueAt = new Date(task.dueAt).getTime();
  if (task.status === "overdue" || dueAt <= now) return "overdue";
  if (dueAt - now <= 24 * 60 * 60 * 1000) return "due_soon";
  return "normal";
}
export function dashboardTaskMatchesFilter(task: DashboardTask, filter: DashboardTaskFilter, now = Date.now()) {
  if (filter === "all") return true;
  return dashboardTaskVisualState(task, now) === filter;
}
export function dashboardPriorityBadge(priority: DashboardTask["priority"] = "normal") {
  return ({ normal: { label: "عادية", className: "bg-[#e6eee5] text-[#486455]" }, high: { label: "أولوية عالية", className: "bg-[#f5edd8] text-[#78612f]" }, critical: { label: "حرجة", className: "bg-[#f8e3de] text-[#9d4034]" } } as const)[priority ?? "normal"];
}
export function dashboardDeadlineBadge(task: DashboardTask, now = Date.now()) {
  const visual = dashboardTaskVisualState(task, now);
  return visual === "overdue" ? { label: "متأخرة", className: "bg-[#f8e6e1] text-[#a8493b]" } : visual === "due_soon" ? { label: "قريبة الموعد", className: "bg-[#f5edd8] text-[#80642b]" } : visual === "completed" ? { label: "مكتملة", className: "bg-[#e4f0e4] text-[#2d684a]" } : { label: "ضمن المسار", className: "bg-[#e4eee5] text-[#35634c]" };
}
export function newlyCompletedDashboardTaskIds(tasks: DashboardTask[], previousStatuses: Map<number, string>) {
  return tasks.filter(task => task.status === "completed" && previousStatuses.has(task.id) && previousStatuses.get(task.id) !== "completed").map(task => task.id);
}
export const dashboardCompletionMotionClass = (isJustCompleted: boolean) => isJustCompleted ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300 motion-safe:ease-out motion-reduce:animate-none" : "";
export const stateTone = (late = 0, due = 0) => late > 0 ? "bg-[#f8e6e1] text-[#963e33]" : due > 0 ? "bg-[#f5edd8] text-[#80642b]" : "bg-[#e2eee3] text-[#2d684a]";
export const stateLabel = (late = 0, due = 0) => late > 0 ? "يحتاج تدخلاً" : due > 0 ? "قريب الاستحقاق" : "ضمن المسار";
export const formatUnreadBadgeCount = (count = 0) => count > 99 ? "99+" : String(Math.max(0, count));
export const dashboardMetricIconSlotClass = "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-current/15 bg-current/10";
export function profileInitials(name: string) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("");
  return initials || "ف";
}
export function teamStatusLabel(status?: TeamMember["status"]) {
  if (status === "on_leave") return "في إجازة";
  if (status === "inactive") return "غير نشط";
  if (status === "pending_review") return "قيد المراجعة";
  return "نشط";
}

/** شريط مؤشر مدمج: عنصر صغير لا بطاقة، يعرض الرقم والوصف ويعيد التوجيه عند النقر. */
function WidgetCard({ label, icon: Icon, tone, count, sub, pulse = false, onClick }: { label: string; icon: typeof ListChecks; tone: string; count?: number; sub?: string; pulse?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-right text-white shadow-[0_14px_32px_rgba(20,40,32,0.16)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_20px_44px_rgba(20,40,32,0.26)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${tone} ${pulse ? "animate-pulse" : ""}`}>
      {pulse && <span aria-hidden="true" className="absolute left-3 top-3 flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-white" /></span>}
      <span className="flex w-full items-center justify-between gap-2">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm"><Icon className="h-5 w-5" strokeWidth={2.1} aria-hidden="true" /></span>
        {typeof count === "number" && <span className="rounded-full bg-white/25 px-2.5 py-1 text-sm font-black tabular-nums">{formatUnreadBadgeCount(count)}</span>}
      </span>
      <span className="mt-3 block text-base font-black leading-tight">{label}</span>
      {sub ? <span className="mt-0.5 block text-[11px] font-semibold text-white/80">{sub}</span> : null}
    </button>
  );
}

type HomeCardEntry = { id: DashboardHomeCardId; label: string; icon: typeof ListChecks; tone: string; count?: number; sub: string; path: string; pulse?: boolean; allowed: boolean };

function DraggableHomeCard({ card, isDragging, isDragOver, onActivate, onDragStart, onDragEnd, onDragOver, onDrop, onHide }: { card: HomeCardEntry; isDragging: boolean; isDragOver: boolean; onActivate: () => void; onDragStart: (event: React.DragEvent<HTMLDivElement>) => void; onDragEnd: () => void; onDragOver: (event: React.DragEvent<HTMLDivElement>) => void; onDrop: (event: React.DragEvent<HTMLDivElement>) => void; onHide: () => void }) {
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} className={`group relative cursor-grab transition ${isDragging ? "opacity-40" : ""} ${isDragOver ? "rounded-2xl ring-2 ring-[#78a886] ring-offset-2" : ""}`}>
      <WidgetCard label={card.label} icon={card.icon} tone={card.tone} count={card.count} sub={card.sub} pulse={card.pulse} onClick={onActivate} />
      <button type="button" onClick={onHide} aria-label={`إخفاء ${card.label}`} title="إخفاء البطاقة" className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/15 text-white/85 transition hover:bg-black/35 hover:text-white focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><EyeOff className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const permission = trpc.court.registration.myPermission.useQuery();
  const roles = trpc.court.myRoles.useQuery();
  const dashboard = trpc.court.dashboard.useQuery();
  const dashboardPreferencesProcedure = trpc.court.dashboardPreferences;
  const savedDashboardPreferences = dashboardPreferencesProcedure?.mine?.useQuery ? dashboardPreferencesProcedure.mine.useQuery() : { data: undefined as DashboardPreferenceState | undefined };
  const saveDashboardPreferences = dashboardPreferencesProcedure?.update?.useMutation
    ? dashboardPreferencesProcedure.update.useMutation({ onSuccess: preferences => { setPreferences(normalizeDashboardPreferences(preferences)); setDashboardCustomizationOpen(false); toast.success("تم حفظ تخصيص شريط العمل السريع والقائمة."); }, onError: error => toast.error(error.message) })
    : { isPending: false, mutate: (_input: DashboardPreferenceState) => toast.error("خدمة التخصيص غير متاحة حالياً.") };
  const persistDashboardPreferences = dashboardPreferencesProcedure?.update?.useMutation
    ? dashboardPreferencesProcedure.update.useMutation({ onSuccess: preferences => setPreferences(normalizeDashboardPreferences(preferences)) })
    : { isPending: false, mutate: (_input: DashboardPreferenceState) => undefined };
  const [preferences, setPreferences] = useState<DashboardPreferenceState>(() => normalizeDashboardPreferences(readDashboardPreferencesLocal<DashboardPreferenceState>() ?? defaultDashboardPreferences()));
  const [dashboardCustomizationOpen, setDashboardCustomizationOpen] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<DashboardHomeCardId | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<DashboardHomeCardId | null>(null);
  const [dragOverHidden, setDragOverHidden] = useState(false);

  useEffect(() => {
    if (savedDashboardPreferences.data) setPreferences(normalizeDashboardPreferences(savedDashboardPreferences.data));
  }, [savedDashboardPreferences.data]);

  const metrics = (dashboard.data ?? {}) as Metrics;
  const mailUnreadCount = Number((((trpc.court as any).internalMail?.folderCounts?.useQuery ? (trpc.court as any).internalMail.folderCounts.useQuery() : { data: { unread: 0 } }).data?.unread) || 0);
  const chatUnreadCount = Number((((trpc.court as any).communications?.conversations?.unreadCount?.useQuery ? (trpc.court as any).communications.conversations.unreadCount.useQuery() : { data: 0 }).data) || 0);
  const isLeadership = permission.data === "full_control" || (roles.data ?? []).some(role => ["court_president", "assistant_president", "court_secretary"].includes(role));
  const canManageRotation = permission.data === "full_control" || (roles.data ?? []).some(role => ["court_president", "assistant_president", "court_secretary", "owner"].includes(role));
  const unreadNotifications = Number(metrics.unreadNotifications ?? 0);
  const openTasks = Number(metrics.openTasks ?? 0);
  const overdueTasks = Number(metrics.overdueTasks ?? 0);
  const openDelays = Number(metrics.openDelays ?? 0);
  const overdueDelays = Number(metrics.overdueDelays ?? 0);
  const profiles = Number(metrics.profiles ?? 0);
  const templates = Number(metrics.templates ?? 0);
  const dueTasks = Number(metrics.dueTasks ?? 0);
  const activeCount = openTasks + overdueTasks;
  const lateCount = overdueTasks + overdueDelays;

  const homeCards: HomeCardEntry[] = [
    { id: "home", label: "الرئيسية", icon: LayoutDashboard, tone: "from-[#1f6e4d] to-[#2f8a63]", sub: "نظرة عامة على عملك", path: "/", allowed: true },
    { id: "tasks-active", label: "مهام قيد التنفيذ", icon: ListChecks, tone: "from-[#0e8a6d] to-[#14a37f]", count: openTasks, sub: "تُنجز الآن", path: "/tasks?filter=active", allowed: true },
    { id: "tasks-due-soon", label: "قرب موعدها", icon: Clock3, tone: "from-[#b9871f] to-[#d9a437]", count: dueTasks, sub: "استحقاق خلال 24 ساعة", path: "/tasks?filter=due_soon", allowed: true },
    { id: "tasks-overdue", label: "متأخرة", icon: AlertTriangle, tone: "from-[#c22b2b] to-[#e0473e]", count: overdueTasks, sub: "تتطلب تدخلاً فورياً", pulse: overdueTasks > 0, path: "/tasks?filter=overdue", allowed: true },
    { id: "tasks-completed", label: "تمت المعالجة", icon: TrendingUp, tone: "from-[#2c8f4f] to-[#3fae63]", sub: "إنجازاتك المكتملة", path: "/tasks?filter=completed", allowed: true },
    { id: "notifications", label: "الإشعارات", icon: BellRing, tone: "from-[#1d6fa5] to-[#2c88c4]", count: unreadNotifications, sub: "مركز التنبيهات", path: "/notifications", allowed: true },
    { id: "chats", label: "الدردشات", icon: MessageSquare, tone: "from-[#0e7f8a] to-[#16a1ad]", count: chatUnreadCount, sub: "محادثات القسم والمهام", path: "/messages", allowed: true },
    { id: "mail", label: "بريد ركيزة", icon: Mail, tone: "from-[#4757a8] to-[#5d6fd6]", count: mailUnreadCount, sub: "المراسلات الداخلية", path: "/rakiza-mail", allowed: true },
    { id: "report-upload", label: "رفع تقرير", icon: FileUp, tone: "from-[#a8641c] to-[#d0833a]", sub: "تقرير إنجاز أو متابعة", path: "/report-upload", allowed: true },
    { id: "guide", label: "دليل المستخدم", icon: BadgeHelp, tone: "from-[#55636f] to-[#72818e]", sub: "طريقة الاستخدام", path: "/guide", allowed: true },
    { id: "personal-settings", label: "إعدادات الموظف", icon: UserCog, tone: "from-[#2f6e4d] to-[#3f8a62]", sub: "بياناتك وتفضيلاتك", path: "/personal-settings", allowed: true },
    { id: "rotation", label: "المداورة", icon: Repeat, tone: "from-[#a8445a] to-[#c9607a]", sub: "التدوير والمقترحات", path: "/rotation", allowed: canManageRotation },
    { id: "hierarchy", label: "هيكل المحكمة", icon: Network, tone: "from-[#7a6a4f] to-[#94845f]", sub: "الأقسام والإدارات", path: "/hierarchy", allowed: isLeadership },
    { id: "delays", label: "المتعثرات", icon: AlertTriangle, tone: "from-[#9e3b32] to-[#c15345]", count: openDelays, sub: "معاملات متعثرة", path: "/delays", allowed: isLeadership },
    { id: "assistants", label: "AI ركيزة", icon: Bot, tone: "from-[#6b4d9e] to-[#8561c4]", sub: "مساعدك الذكي", path: "/assistants", allowed: isLeadership },
    { id: "announcements", label: "الإعلانات", icon: Megaphone, tone: "from-[#b0611f] to-[#d0813f]", sub: "التعاميم الداخلية", path: "/announcements", allowed: isLeadership },
    { id: "platform-settings", label: "إعدادات المنصة", icon: Settings2, tone: "from-[#3a4651] to-[#4e5c69]", sub: "تهيئة النظام", path: "/platform-settings", allowed: isLeadership },
  ];
  const homeCardById = new Map(homeCards.map(card => [card.id, card] as const));
  const orderedHomeCardIds = Array.from(new Set([...preferences.homeCardOrder, ...DASHBOARD_HOME_CARD_IDS]));
  const hiddenHomeCardIdSet = new Set(preferences.hiddenHomeCardIds);
  const visibleCards = orderedHomeCardIds.map(id => homeCardById.get(id)).filter((card): card is HomeCardEntry => Boolean(card && card.allowed && !hiddenHomeCardIdSet.has(card.id)));
  const hiddenCards = orderedHomeCardIds.map(id => homeCardById.get(id)).filter((card): card is HomeCardEntry => Boolean(card && card.allowed && hiddenHomeCardIdSet.has(card.id)));
  const applyPreferences = (next: DashboardPreferenceState) => { setPreferences(next); writeDashboardPreferencesLocal(next); persistDashboardPreferences.mutate(next); };
  const reorderHomeCard = (fromId: DashboardHomeCardId, toId: DashboardHomeCardId) => {
    const order = [...preferences.homeCardOrder];
    const fromIndex = order.indexOf(fromId);
    const toIndex = order.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    applyPreferences({ ...preferences, homeCardOrder: order });
  };
  const hideHomeCard = (id: DashboardHomeCardId) => { if (preferences.hiddenHomeCardIds.includes(id)) return; applyPreferences({ ...preferences, hiddenHomeCardIds: [...preferences.hiddenHomeCardIds, id] }); };
  const showHomeCard = (id: DashboardHomeCardId) => applyPreferences({ ...preferences, hiddenHomeCardIds: preferences.hiddenHomeCardIds.filter(item => item !== id) });
  const restoreAllHomeCards = () => applyPreferences({ ...preferences, hiddenHomeCardIds: [] });

  const dashboardCustomizer = <>
    <button type="button" onClick={() => setDashboardCustomizationOpen(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-xs font-black text-white/85 transition hover:bg-white/10"><Settings2 className="h-4 w-4" aria-hidden="true" />تخصيص شريط العمل السريع</button>
    <DashboardCustomizationDialog open={dashboardCustomizationOpen} onOpenChange={setDashboardCustomizationOpen} preferences={preferences} onChange={setPreferences} onSave={() => saveDashboardPreferences.mutate(preferences)} isSaving={Boolean(saveDashboardPreferences.isPending)} />
  </>;

  return <DashboardLayout hideUtilityPrompts dashboardCustomization={dashboardCustomizer} navigationPreferences={preferences}>
    <section className="mx-auto max-w-[1240px]" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d5ddd2] bg-[#f8f9f4] px-4 py-3 shadow-[0_8px_22px_rgba(36,67,51,0.05)]">
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[0.12em] text-[#b18448]">مساحة العمل</p>
          <h1 className="mt-1 text-xl font-black text-[#12352f]">{isLeadership ? "لوحة القيادة المدمجة" : "مساحتي اليومية"}</h1>
          <p className="mt-1 text-xs leading-6 text-[#66766e]">شبكة بطاقاتك الرئيسية: كل بطاقة تعرض عدّاداتها الحية وتفتح ميزتها بنقرة واحدة.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GlobalSearchBar />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6efe4] px-3 py-1.5 text-[11px] font-bold text-[#2d6b4f]"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{activeCount > 0 ? `${activeCount} مهمة مفتوحة` : "لا مهام مفتوحة"}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${lateCount > 0 ? "bg-[#f8e6e1] text-[#963e33]" : "bg-[#e6efe4] text-[#2d6b4f]"}`}><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{lateCount > 0 ? `${lateCount} متأخر` : "لا متأخرات"}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf4ff] px-3 py-1.5 text-[11px] font-bold text-[#26628d]"><BellRing className="h-3.5 w-3.5" aria-hidden="true" />{unreadNotifications > 0 ? `${formatUnreadBadgeCount(unreadNotifications)} تنبيه جديد` : "لا تنبيهات جديدة"}</span>
        </div>
      </header>

            <section aria-label="الشبكة الرئيسية" className="mt-5">
        <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-[#7a8980]"><GripVertical className="h-3.5 w-3.5" aria-hidden="true" />اسحب البطاقات لإعادة ترتيبها، أو أسقطها داخل «البطاقات المخفية» بالأسفل لإخفائها.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleCards.map(card => (
            <DraggableHomeCard
              key={card.id}
              card={card}
              isDragging={draggingCardId === card.id}
              isDragOver={dragOverCardId === card.id}
              onActivate={() => setLocation(card.path)}
              onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); setDraggingCardId(card.id); }}
              onDragEnd={() => { setDraggingCardId(null); setDragOverCardId(null); }}
              onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (dragOverCardId !== card.id) setDragOverCardId(card.id); }}
              onDrop={event => { event.preventDefault(); if (draggingCardId && draggingCardId !== card.id) reorderHomeCard(draggingCardId, card.id); setDraggingCardId(null); setDragOverCardId(null); }}
              onHide={() => hideHomeCard(card.id)}
            />
          ))}
        </div>
        <section aria-label="البطاقات المخفية" onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (!dragOverHidden) setDragOverHidden(true); }} onDragLeave={() => setDragOverHidden(false)} onDrop={event => { event.preventDefault(); if (draggingCardId) hideHomeCard(draggingCardId); setDraggingCardId(null); setDragOverHidden(false); }} className={`mt-4 rounded-2xl border border-dashed p-4 transition ${dragOverHidden ? "border-[#c26a2b] bg-[#fff6ec]" : "border-[#d8d1c5] bg-[#fbfaf6]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold text-[#6d7d74]"><EyeOff className="ml-1 inline h-4 w-4" aria-hidden="true" />البطاقات المخفية — اسحب بطاقة هنا لإخفائها</p>
            {hiddenCards.length > 0 && <button type="button" onClick={restoreAllHomeCards} className="inline-flex items-center gap-1.5 rounded-lg border border-[#c6d4c7] px-2.5 py-1.5 text-xs font-bold text-[#355d4b] transition hover:bg-[#e8f0e7]"><RotateCcw className="h-3.5 w-3.5" />استعادة الكل</button>}
          </div>
          {hiddenCards.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{hiddenCards.map(card => <span key={card.id} className="inline-flex items-center gap-2 rounded-xl border border-[#e2d9c9] bg-white px-3 py-2 text-xs font-bold text-[#5a6b60]">{card.label}<button type="button" onClick={() => showHomeCard(card.id)} aria-label={`إظهار ${card.label}`} title="إظهار البطاقة" className="grid h-6 w-6 place-items-center rounded-md bg-[#e3eee2] text-[#2d6b4f] transition hover:bg-[#d3e6d2]"><Eye className="h-3.5 w-3.5" /></button></span>)}</div> : <p className="mt-2 text-xs text-[#a09a8d]">لا بطاقات مخفية حالياً.</p>}
        </section>
      </section>

    </section>
  </DashboardLayout>;
}

