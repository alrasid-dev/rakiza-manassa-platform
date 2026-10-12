import { Bot, Mail, Play, Sparkles, BellRing, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

type PromptTask = { id: number; title: string; dueAt?: Date | string | number; status?: string };
type AiRakizaContext = { kind: "task" | "mail" | "notification" | "welcome"; title: string; description: string; actionLabel?: string };

export function nextAiRakizaTask(tasks: PromptTask[]) {
  return tasks
    .filter(task => task.status === "in_progress")
    .sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime())[0] || null;
}

export function buildAiRakizaContexts(input: { tasks: PromptTask[]; unreadMailCount?: number; urgentUnreadMailCount?: number; unreadNotificationCount?: number }): AiRakizaContext[] {
  const contexts: AiRakizaContext[] = [];
  const task = nextAiRakizaTask(input.tasks);
  const urgentUnreadMailCount = Math.max(0, Math.min(input.unreadMailCount ?? 0, input.urgentUnreadMailCount ?? 0));
  if (urgentUnreadMailCount > 0) contexts.push({ kind: "mail", title: `لديك ${urgentUnreadMailCount} رسالة عاجلة غير مقروءة`, description: "ابدأ بمراجعة البريد العاجل قبل متابعة الأولويات الأخرى. يمكن للمساعد تقديم اقتراحات للمراجعة فقط.", actionLabel: "فتح البريد العاجل" });
  if (task) contexts.push({ kind: "task", title: task.title, description: "هذه المهمة قيد التنفيذ وتحتاج متابعة. افتحها لاستكمال العمل أو راجع الأولويات مع AI ركيزة.", actionLabel: "فتح المهمة" });
  const otherUnreadMailCount = Math.max(0, (input.unreadMailCount ?? 0) - urgentUnreadMailCount);
  if (otherUnreadMailCount > 0) contexts.push({ kind: "mail", title: `لديك ${otherUnreadMailCount} رسالة غير مقروءة`, description: "راجع بريد ركيزة عند مناسبة الأولوية. يمكن للمساعد تقديم اقتراحات للمراجعة فقط.", actionLabel: "فتح البريد" });
  if ((input.unreadNotificationCount ?? 0) > 0) contexts.push({ kind: "notification", title: `لديك ${input.unreadNotificationCount} تنبيهات غير مقروءة`, description: "يمكنك مراجعة التنبيهات وتحديد ما يحتاج متابعة؛ لا ينفذ AI ركيزة أي إجراء نيابة عنك.", actionLabel: "فتح التنبيهات" });
  return contexts.length ? contexts : [{ kind: "welcome", title: "المساعد حاضر عند الحاجة", description: "سيعرض AI ركيزة تنبيهات سياقية عند وجود مهمة قيد التنفيذ أو بريد أو إشعار يحتاج مراجعة، مع بقاء جميع الإجراءات بقرارك.", actionLabel: "فتح AI ركيزة" }];
}

export default function AiRakizaTaskPrompt({ tasks, unreadMailCount = 0, urgentUnreadMailCount = 0, unreadNotificationCount = 0, suppressAutoPrompt = false, isStarting = false, onStart, onOpenAssistant, onOpenMail, onOpenNotifications }: { tasks: PromptTask[]; unreadMailCount?: number; urgentUnreadMailCount?: number; unreadNotificationCount?: number; suppressAutoPrompt?: boolean; isStarting?: boolean; onStart: (task: PromptTask) => void; onOpenAssistant: () => void; onOpenMail: () => void; onOpenNotifications: () => void }) {
  const nextTask = useMemo(() => nextAiRakizaTask(tasks), [tasks]);
  const contexts = useMemo(() => buildAiRakizaContexts({ tasks, unreadMailCount, urgentUnreadMailCount, unreadNotificationCount }), [tasks, unreadMailCount, urgentUnreadMailCount, unreadNotificationCount]);
  const [open, setOpen] = useState(false);
  const automaticPromptIdentity = urgentUnreadMailCount > 0 ? "urgent-mail" : nextTask ? `task-${nextTask.id}` : null;
  useEffect(() => {
    if (suppressAutoPrompt) { setOpen(false); return; }
    if (!automaticPromptIdentity || typeof window === "undefined") return;
    const key = `rakiza:ai-task-prompt:${new Date().toLocaleDateString("en-CA")}:${automaticPromptIdentity}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "seen");
    const timer = window.setTimeout(() => setOpen(true), 450);
    return () => window.clearTimeout(timer);
  }, [automaticPromptIdentity, suppressAutoPrompt]);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="فتح مساعد AI ركيزة" className="rakiza-ai-presence fixed bottom-5 left-5 z-30 inline-flex items-center gap-2 rounded-full border border-[#b9d2ba] bg-[var(--rakiza-surface)] px-3 py-2 text-sm font-black text-[var(--rakiza-olive-strong)] shadow-[0_10px_26px_rgba(30,61,48,.18)] hover:bg-[#e4eee2]">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--rakiza-olive)] text-white"><Sparkles className="h-4 w-4" /></span>AI ركيزة
    </button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="ai-rakiza-title" className="fixed inset-0 z-50 grid place-items-center bg-[#14251c]/35 p-4">
      <section dir="rtl" className="w-full max-w-md rounded-[1.6rem] border border-[#cad8c9] bg-[var(--rakiza-surface)] p-5 shadow-[0_24px_70px_rgba(20,48,35,.24)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--rakiza-olive)] text-white"><Bot className="h-5 w-5" /></span>
            <div><p className="text-xs font-black tracking-[.1em] text-[#4a785a]">مساعدة AI ركيزة</p><h2 id="ai-rakiza-title" className="mt-1 text-lg font-black text-[#183d2d]">نظرة سياقية للعمل</h2></div>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="grid h-8 w-8 place-items-center rounded-lg text-[#587164] hover:bg-[#e5eee4]"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 space-y-2">{contexts.map((context, index) => <div key={`${context.kind}-${index}`} className="rounded-xl border border-[#d3dfd1] bg-[#eef3eb] p-3"><p className="text-sm font-black text-[#29493a]">{context.title}</p><p className="mt-1 text-xs leading-6 text-[#63766a]">{context.description}</p>{context.kind === "task" && nextTask ? <button type="button" disabled={isStarting} onClick={() => onStart(nextTask)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--rakiza-olive)] px-3 py-2 text-sm font-black text-white disabled:opacity-55"><Play className="h-4 w-4" />فتح المهمة</button> : context.kind === "mail" ? <button type="button" onClick={() => { setOpen(false); onOpenMail(); }} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#bfd2c0] px-3 py-2 text-sm font-bold text-[#315f49]"><Mail className="h-4 w-4" />{context.actionLabel}</button> : context.kind === "notification" ? <button type="button" onClick={() => { setOpen(false); onOpenNotifications(); }} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#bfd2c0] px-3 py-2 text-sm font-bold text-[#315f49]"><BellRing className="h-4 w-4" />فتح التنبيهات</button> : null}</div>)}</div>
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => { setOpen(false); onOpenAssistant(); }} className="rounded-lg border border-[#bfd2c0] px-3 py-2 text-sm font-bold text-[#315f49]">فتح AI ركيزة</button></div>
      </section>
    </div>}
  </>;
}
