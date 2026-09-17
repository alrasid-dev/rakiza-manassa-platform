import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, LayoutDashboard, ListChecks, MessageCircle, RotateCcw, Settings2 } from "lucide-react";
import React, { useState } from "react";

export const DASHBOARD_QUICK_ACTIONS = [
  { id: "my-tasks", label: "مهامي", description: "المهام المفتوحة والمتأخرة المسندة إليك" },
  { id: "notifications", label: "الإشعارات", description: "تنبيهات المنصة غير المقروءة" },
  { id: "chats", label: "الدردشات", description: "محادثات القسم والمهام" },
  { id: "mail", label: "البريد", description: "رسائل بريد ركيزة" },
  { id: "report-upload", label: "رفع تقرير", description: "رفع تقرير إنجاز أو مراقبة أداء" },
] as const;

/** بطاقات لوحة القيادة القديمة: أُلغيت من الشاشة، ويُحفظ ترتيبها للتوافق مع التفضيلات المحفوظة. */
export const DASHBOARD_WIDGETS = [
  { id: "overview", label: "ملخص اليوم", description: "المؤشرات والتنبيهات السريعة", icon: LayoutDashboard },
  { id: "tasks", label: "مهامي اليوم", description: "المهام وإجراءاتها المباشرة", icon: ListChecks },
  { id: "chat", label: "دردشة القسم", description: "معاينة تواصل فريق القسم", icon: MessageCircle },
  { id: "performance", label: "أداء الأقسام", description: "الرسوم والمقارنات للقيادة", icon: Settings2 },
] as const;

export const DASHBOARD_NAVIGATION_ITEMS = ["الرئيسية", "مهامي", "الإشعارات", "الدردشات", "بريد ركيزة", "AI ركيزة", "الإعلانات الداخلية", "المتعثرات", "رفع التقارير", "دليل المستخدم", "إعدادات الموظف", "إعدادات المنصة"] as const;
export type DashboardWidgetId = typeof DASHBOARD_WIDGETS[number]["id"];
export type DashboardQuickActionId = typeof DASHBOARD_QUICK_ACTIONS[number]["id"];
export type DashboardNavigationLabel = typeof DASHBOARD_NAVIGATION_ITEMS[number];
export const DASHBOARD_HOME_CARD_IDS = ["home", "tasks-active", "tasks-due-soon", "tasks-overdue", "tasks-completed", "notifications", "chats", "mail", "report-upload", "guide", "personal-settings", "rotation", "hierarchy", "delays", "assistants", "announcements", "platform-settings"] as const;
export type DashboardHomeCardId = typeof DASHBOARD_HOME_CARD_IDS[number];
export type DashboardPreferenceState = { widgetOrder: DashboardWidgetId[]; hiddenWidgetIds: DashboardWidgetId[]; quickActionOrder: DashboardQuickActionId[]; hiddenQuickActionIds: DashboardQuickActionId[]; navigationOrder: DashboardNavigationLabel[]; hiddenNavigationLabels: DashboardNavigationLabel[]; homeCardOrder: DashboardHomeCardId[]; hiddenHomeCardIds: DashboardHomeCardId[] };

export const defaultDashboardPreferences = (): DashboardPreferenceState => ({ widgetOrder: DASHBOARD_WIDGETS.map(item => item.id), hiddenWidgetIds: [], quickActionOrder: DASHBOARD_QUICK_ACTIONS.map(item => item.id), hiddenQuickActionIds: [], navigationOrder: [...DASHBOARD_NAVIGATION_ITEMS], hiddenNavigationLabels: [], homeCardOrder: [...DASHBOARD_HOME_CARD_IDS], hiddenHomeCardIds: [] });

export function normalizeDashboardPreferences(preferences?: Partial<DashboardPreferenceState> | { widgetOrder?: string[]; hiddenWidgetIds?: string[]; quickActionOrder?: string[]; hiddenQuickActionIds?: string[]; navigationOrder?: string[]; hiddenNavigationLabels?: string[]; homeCardOrder?: string[]; hiddenHomeCardIds?: string[] } | null): DashboardPreferenceState {
  const widgetIds = DASHBOARD_WIDGETS.map(item => item.id);
  const quickActionIds = DASHBOARD_QUICK_ACTIONS.map(item => item.id);
  const navigationLabels = DASHBOARD_NAVIGATION_ITEMS as readonly string[];
  const homeCardIds = DASHBOARD_HOME_CARD_IDS as readonly string[];
  const savedWidgetOrder = (preferences?.widgetOrder ?? []).filter((id): id is DashboardWidgetId => widgetIds.includes(id as DashboardWidgetId));
  const savedQuickActionOrder = (preferences?.quickActionOrder ?? []).filter((id): id is DashboardQuickActionId => quickActionIds.includes(id as DashboardQuickActionId));
  const savedNavigationOrder = (preferences?.navigationOrder ?? []).filter((label): label is DashboardNavigationLabel => navigationLabels.includes(label));
  const savedHomeCardOrder = (preferences?.homeCardOrder ?? []).filter((id): id is DashboardHomeCardId => homeCardIds.includes(id as DashboardHomeCardId));
  return {
    widgetOrder: Array.from(new Set([...savedWidgetOrder, ...widgetIds])) as DashboardWidgetId[],
    hiddenWidgetIds: (preferences?.hiddenWidgetIds ?? []).filter((id): id is DashboardWidgetId => widgetIds.includes(id as DashboardWidgetId)),
    quickActionOrder: Array.from(new Set([...savedQuickActionOrder, ...quickActionIds])) as DashboardQuickActionId[],
    hiddenQuickActionIds: (preferences?.hiddenQuickActionIds ?? []).filter((id): id is DashboardQuickActionId => quickActionIds.includes(id as DashboardQuickActionId)),
    navigationOrder: Array.from(new Set([...savedNavigationOrder, ...navigationLabels])) as DashboardNavigationLabel[],
    hiddenNavigationLabels: (preferences?.hiddenNavigationLabels ?? []).filter((label): label is DashboardNavigationLabel => navigationLabels.includes(label)),
    homeCardOrder: Array.from(new Set([...savedHomeCardOrder, ...homeCardIds])) as DashboardHomeCardId[],
    hiddenHomeCardIds: (preferences?.hiddenHomeCardIds ?? []).filter((id): id is DashboardHomeCardId => homeCardIds.includes(id as DashboardHomeCardId)),
  };
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function ToggleList<T extends string>({ label, order, hidden, onMove, onToggle, descriptions }: { label: string; order: T[]; hidden: T[]; onMove: (from: number, to: number) => void; onToggle: (id: T) => void; descriptions: Record<T, string> }) {
  const [draggedId, setDraggedId] = useState<T | null>(null);
  return <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-[#25463a]">{label}</h3><span className="text-[10px] font-semibold text-[#718078]">اسحب للترتيب</span></div><ul className="space-y-2">{order.map((id, index) => { const isHidden = hidden.includes(id); return <li key={id} data-testid={`sortable-${label}-${id}`} draggable aria-grabbed={draggedId === id} onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); setDraggedId(id); }} onDragEnd={() => setDraggedId(null)} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={() => { const from = draggedId ? order.indexOf(draggedId) : -1; if (from >= 0) onMove(from, index); setDraggedId(null); }} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${draggedId === id ? "border-[#7faa82] bg-[#e3eee2] opacity-60" : "border-[#cfd7ca] bg-[#f8f8f3]"}`}><GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[#7e9381]" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-xs font-black text-[#315348]">{id}</span><span className="block truncate text-[10px] text-[#718078]">{descriptions[id]}</span></span><button type="button" aria-label={`نقل ${id} للأعلى`} disabled={index === 0} onClick={() => onMove(index, index -1)} className="grid h-7 w-7 place-items-center rounded-lg text-[#4f6d5b] hover:bg-[#e2ebe0] disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" aria-label={`نقل ${id} للأسفل`} disabled={index === order.length - 1} onClick={() => onMove(index, index + 1)} className="grid h-7 w-7 place-items-center rounded-lg text-[#4f6d5b] hover:bg-[#e2ebe0] disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" aria-label={isHidden ? `إظهار ${id}` : `إخفاء ${id}`} onClick={() => onToggle(id)} className={`grid h-7 w-7 place-items-center rounded-lg ${isHidden ? "bg-[#f9ece8] text-[#a34c40]" : "bg-[#e3eee2] text-[#2d6b4f]"}`}>{isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button></li>; })}</ul></section>;
}

export function DashboardCustomizationDialog({ open, onOpenChange, preferences, onChange, onSave, onResetNavigation, isSaving }: { open: boolean; onOpenChange: (open: boolean) => void; preferences: DashboardPreferenceState; onChange: (preferences: DashboardPreferenceState) => void; onSave: () => void; onResetNavigation?: () => void; isSaving: boolean }) {
  const moveQuickAction = (from: number, to: number) => onChange({ ...preferences, quickActionOrder: moveItem(preferences.quickActionOrder, from, to) });
  const toggleQuickAction = (id: DashboardQuickActionId) => onChange({ ...preferences, hiddenQuickActionIds: preferences.hiddenQuickActionIds.includes(id) ? preferences.hiddenQuickActionIds.filter(item => item !== id) : [...preferences.hiddenQuickActionIds, id] });
  const moveNavigation = (from: number, to: number) => onChange({ ...preferences, navigationOrder: moveItem(preferences.navigationOrder, from, to) });
  const toggleNavigation = (id: DashboardNavigationLabel) => onChange({ ...preferences, hiddenNavigationLabels: preferences.hiddenNavigationLabels.includes(id) ? preferences.hiddenNavigationLabels.filter(item => item !== id) : [...preferences.hiddenNavigationLabels, id] });
  const quickActionDescriptions = Object.fromEntries(DASHBOARD_QUICK_ACTIONS.map(item => [item.id, item.description])) as Record<DashboardQuickActionId, string>;
  const navigationDescriptions = Object.fromEntries(DASHBOARD_NAVIGATION_ITEMS.map(item => [item, "اختصار من القائمة اليمنى"])) as Record<DashboardNavigationLabel, string>;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl" className="max-h-[88vh] max-w-2xl overflow-y-auto border-[#cfd7ca] bg-[#f2f3ed]"><DialogHeader><DialogTitle>تخصيص شريط العمل السريع والقائمة</DialogTitle><DialogDescription>رتّب أيقونات العمل السريع في الأعلى، وما تخفيه ينتقل تلقائياً إلى القائمة الجانبية فلا تفقد الوصول إليه. الاختصارات مربوطة بصفحات حقيقية مثل رفع التقارير ودليل المستخدم. تعمل الأسهم كبديل مناسب للجوال ولوحة المفاتيح.</DialogDescription></DialogHeader><div className="grid gap-6 md:grid-cols-2"><ToggleList label="شريط العمل السريع" order={preferences.quickActionOrder} hidden={preferences.hiddenQuickActionIds} onMove={moveQuickAction} onToggle={toggleQuickAction} descriptions={quickActionDescriptions} /><ToggleList label="اختصارات القائمة اليمنى" order={preferences.navigationOrder} hidden={preferences.hiddenNavigationLabels} onMove={moveNavigation} onToggle={toggleNavigation} descriptions={navigationDescriptions} /></div><DialogFooter className="gap-2 sm:justify-between"><div className="flex flex-wrap gap-2"><button type="button" disabled={isSaving} onClick={() => onChange(defaultDashboardPreferences())} className="inline-flex items-center gap-1.5 rounded-lg border border-[#c6d4c7] px-3 py-2 text-xs font-black text-[#355d4b] disabled:opacity-60"><RotateCcw className="h-3.5 w-3.5" />استعادة كل الإعدادات</button><button type="button" disabled={isSaving} onClick={() => onResetNavigation ? onResetNavigation() : onChange({ ...preferences, navigationOrder: [...DASHBOARD_NAVIGATION_ITEMS], hiddenNavigationLabels: [] })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#b9d0be] bg-[#e8f0e7] px-3 py-2 text-xs font-black text-[#2d684a] disabled:opacity-60"><RotateCcw className="h-3.5 w-3.5" />استعادة اختصارات القائمة</button></div><div className="flex gap-2"><button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border border-[#c6d4c7] px-3 py-2 text-xs font-black text-[#355d4b]">إلغاء</button><button type="button" disabled={isSaving} onClick={onSave} className="rounded-lg bg-[#2d6b4f] px-3 py-2 text-xs font-black text-white disabled:opacity-60">{isSaving ? "جارٍ الحفظ…" : "حفظ التخصيص"}</button></div></DialogFooter></DialogContent></Dialog>;
}
