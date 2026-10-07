import { AlertTriangle, BellRing, CalendarClock, CheckCircle2, Circle, Clock3, FileText, Inbox, ListChecks, Mail, MessageSquare, TrendingUp, type LucideIcon } from "lucide-react";

export const STAT_CARD_IDS = ["tasks-active", "tasks-due-soon", "tasks-overdue", "tasks-open", "notifications", "chats", "mail"] as const;
export type StatCardId = typeof STAT_CARD_IDS[number];

export type StatCardDefinition = { label: string; icon: LucideIcon; gradient: string; darkText?: boolean };
export type StatCardIconOption = { key: string; icon: LucideIcon; label: string };
export type StatCardColorOption = { key: string; gradient: string; label: string; darkText?: boolean };

export const STAT_CARD_DEFINITIONS: Record<StatCardId, StatCardDefinition> = {
  "tasks-active": { label: "قيد التنفيذ", icon: ListChecks, gradient: "from-sky-400 to-sky-500" },
  "tasks-due-soon": { label: "قرب موعدها", icon: Clock3, gradient: "from-amber-300 to-amber-400", darkText: true },
  "tasks-overdue": { label: "متأخرة", icon: AlertTriangle, gradient: "from-red-500 to-rose-600" },
  "tasks-open": { label: "مفتوحة", icon: Circle, gradient: "from-slate-400 to-slate-500", darkText: true },
  "notifications": { label: "الإشعارات", icon: BellRing, gradient: "from-indigo-500 to-purple-600" },
  "chats": { label: "الدردشات", icon: MessageSquare, gradient: "from-teal-500 to-cyan-600" },
  "mail": { label: "بريد ركيزة", icon: Mail, gradient: "from-blue-500 to-indigo-600" },
};

export const STAT_CARD_ICON_OPTIONS: StatCardIconOption[] = [
  { key: "list-checks", icon: ListChecks, label: "قائمة مهام" },
  { key: "clock", icon: Clock3, label: "ساعة" },
  { key: "alert", icon: AlertTriangle, label: "تحذير" },
  { key: "circle", icon: Circle, label: "دائرة" },
  { key: "bell", icon: BellRing, label: "جرس" },
  { key: "message", icon: MessageSquare, label: "محادثة" },
  { key: "mail", icon: Mail, label: "بريد" },
  { key: "trending", icon: TrendingUp, label: "إنجاز" },
  { key: "file", icon: FileText, label: "ملف" },
  { key: "calendar", icon: CalendarClock, label: "تقويم" },
  { key: "check", icon: CheckCircle2, label: "إنجاز أخضر" },
  { key: "inbox", icon: Inbox, label: "صندوق وارد" },
];

export const STAT_CARD_COLOR_OPTIONS: StatCardColorOption[] = [
  { key: "sky", gradient: "from-sky-400 to-sky-500", label: "أزرق هادئ" },
  { key: "amber", gradient: "from-amber-300 to-amber-400", label: "أصفر فاتح", darkText: true },
  { key: "red", gradient: "from-red-500 to-rose-600", label: "أحمر متفاعل" },
  { key: "slate", gradient: "from-slate-400 to-slate-500", label: "رمادي محايد", darkText: true },
  { key: "indigo", gradient: "from-indigo-500 to-purple-600", label: "بنفسجي" },
  { key: "teal", gradient: "from-teal-500 to-cyan-600", label: "تركواز" },
  { key: "blue", gradient: "from-blue-500 to-indigo-600", label: "أزرق رسمي" },
  { key: "emerald", gradient: "from-emerald-500 to-emerald-600", label: "أخضر" },
  { key: "orange", gradient: "from-orange-500 to-amber-600", label: "برتقالي" },
  { key: "pink", gradient: "from-pink-500 to-rose-600", label: "وردي" },
];

export function resolveStatIcon(id: StatCardId, iconKey?: string): LucideIcon {
  return STAT_CARD_ICON_OPTIONS.find(option => option.key === iconKey)?.icon ?? STAT_CARD_DEFINITIONS[id].icon;
}

export function resolveStatColor(id: StatCardId, colorKey?: string): { gradient: string; darkText: boolean } {
  const option = STAT_CARD_COLOR_OPTIONS.find(item => item.key === colorKey);
  return option ? { gradient: option.gradient, darkText: Boolean(option.darkText) } : { gradient: STAT_CARD_DEFINITIONS[id].gradient, darkText: Boolean(STAT_CARD_DEFINITIONS[id].darkText) };
}
