import { BellRing, FileUp, ListChecks, Mail, MessageSquare } from "lucide-react";
import React from "react";

export type QuickActionPermission = "full_control" | "general_view" | "employee" | "trainee" | null | undefined;
export type QuickActionId = "my-tasks" | "notifications" | "chats" | "mail" | "report-upload";
export type QuickActionCounts = { taskAttention: number; notifications: number; chat: number; mail: number; urgentMail: number };

/**
 * شريط العمل السريع العلوي: خمسة إجراءات فقط بعدّاداتها الحقيقية.
 * ما يخفيه المستخدم من الشريط ينتقل تلقائياً إلى القائمة الجانبية (لا يُفقد الوصول).
 */
export const quickActionCatalog: Array<{ id: QuickActionId; label: string; description: string; path: string; icon: typeof ListChecks; countKey?: "taskAttention" | "notifications" | "chat" | "mail" }> = [
  { id: "my-tasks", label: "مهامي", description: "المهام المفتوحة والمتأخرة المسندة إليك", path: "/tasks", icon: ListChecks, countKey: "taskAttention" },
  { id: "notifications", label: "الإشعارات", description: "تنبيهات المنصة غير المقروءة", path: "/notifications", icon: BellRing, countKey: "notifications" },
  { id: "chats", label: "الدردشات", description: "محادثات القسم والمهام غير المقروءة", path: "/messages", icon: MessageSquare, countKey: "chat" },
  { id: "mail", label: "البريد", description: "رسائل بريد ركيزة غير المقروءة", path: "/rakiza-mail", icon: Mail, countKey: "mail" },
  { id: "report-upload", label: "رفع تقرير", description: "رفع تقرير إنجاز أو تقرير مراقبة أداء", path: "/report-upload", icon: FileUp },
];

export function normalizeQuickActionCounts(counts?: Partial<QuickActionCounts>): QuickActionCounts {
  const positive = (value?: number) => Math.max(0, Math.trunc(Number(value) || 0));
  return { taskAttention: positive(counts?.taskAttention), notifications: positive(counts?.notifications), chat: positive(counts?.chat), mail: positive(counts?.mail), urgentMail: positive(counts?.urgentMail) };
}

export function quickActionCountFor(entry: (typeof quickActionCatalog)[number], counts: QuickActionCounts) {
  return entry.countKey ? counts[entry.countKey] : 0;
}

/**
 * يحسب ما يُعرض داخل الشريط: يبقى الإجراء إلا إذا أخفاه المستخدم (فينتقل للقائمة الجانبية)،
 * ويُرتّب حسب الترتيب المحفوظ ثم يثبّت أي إجراء جديد لم يُحفظ بعد.
 */
export function buildQuickActions(input: { counts?: Partial<QuickActionCounts>; quickActionOrder?: QuickActionId[]; hiddenQuickActionIds?: QuickActionId[]; departmentConversationId?: number | null; limit?: number }) {
  const counts = normalizeQuickActionCounts(input.counts);
  const hidden = new Set(input.hiddenQuickActionIds ?? []);
  const savedOrder = (input.quickActionOrder ?? []).filter(id => quickActionCatalog.some(entry => entry.id === id));
  const orderedIds = Array.from(new Set([...savedOrder, ...quickActionCatalog.map(entry => entry.id)]));
  const limit = Math.max(1, Math.trunc(input.limit ?? quickActionCatalog.length));
  return orderedIds
    .map(id => quickActionCatalog.find(entry => entry.id === id)!)
    .filter(entry => !hidden.has(entry.id))
    .slice(0, limit)
    .map(entry => {
      const count = quickActionCountFor(entry, counts);
      const path = entry.id === "chats" && input.departmentConversationId ? `/messages?conversationId=${input.departmentConversationId}` : entry.path;
      return {
        id: entry.id,
        label: entry.label,
        description: entry.description,
        path,
        icon: entry.icon,
        count,
        accessibleLabel: count > 0 ? `${entry.label} — ${count} عنصر يحتاج متابعة` : entry.label,
      };
    });
}

/** ذكاء استباقي: أهم تنبيه واحد من واقع العدّادات، بلا تنفيذ أي إجراء نيابة عن المستخدم. */
export function quickActionsProactiveHint(input?: { counts?: Partial<QuickActionCounts> }) {
  const counts = normalizeQuickActionCounts(input?.counts);
  if (counts.urgentMail > 0) return `ابدأ بالبريد العاجل: ${counts.urgentMail} رسالة عاجلة غير مقروءة تنتظر مراجعتك.`;
  if (counts.notifications > 0) return `لديك ${counts.notifications} تنبيه غير مقروء في مركز الإشعارات.`;
  if (counts.taskAttention > 0) return `لديك ${counts.taskAttention} مهمة قيد التنفيذ تحتاج متابعة قبل موعدها.`;
  if (counts.mail > 0) return `لديك ${counts.mail} رسالة غير مقروءة في بريد ركيزة.`;
  if (counts.chat > 0) return `لديك ${counts.chat} رسالة دردشة غير مقروءة.`;
  return "لا متعطلات عاجلة الآن؛ الأيقونات مرتبة حسب أولوية عملك الحالي.";
}

export default function DynamicQuickActions({ counts, quickActionOrder, hiddenQuickActionIds, departmentConversationId = null, onNavigate, limit, className = "" }: { counts?: Partial<QuickActionCounts>; quickActionOrder?: QuickActionId[]; hiddenQuickActionIds?: QuickActionId[]; departmentConversationId?: number | null; onNavigate: (path: string) => void; limit?: number; className?: string }) {
  const actions = buildQuickActions({ counts, quickActionOrder, hiddenQuickActionIds, departmentConversationId, limit });
  const hint = quickActionsProactiveHint({ counts });
  return (
    <div dir="rtl" role="group" aria-label="العمل السريع" title={hint} data-testid="dynamic-quick-actions" className={`flex min-w-0 flex-wrap items-center justify-end gap-1 ${className}`}>
      <p className="sr-only" data-testid="quick-actions-hint">{hint}</p>
      {actions.map(action => {
        const Icon = action.icon;
        const isUrgent = action.id !== "report-upload" && action.count > 0;
        return (
          <button
            key={action.id}
            type="button"
            aria-label={action.accessibleLabel}
            title={`${action.label} — ${action.description}`}
            data-quick-action={action.id}
            onClick={() => onNavigate(action.path)}
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[#486455] transition hover:bg-[#e1ebe0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78a886]"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {action.count > 0 ? <span aria-hidden="true" data-testid={`quick-action-badge-${action.id}`} className={`absolute left-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#c83b3b] px-1 text-[9px] font-bold text-white ${isUrgent ? "motion-safe:animate-pulse ring-2 ring-[#c83b3b]/30" : ""}`}>{action.count > 9 ? "9+" : action.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

