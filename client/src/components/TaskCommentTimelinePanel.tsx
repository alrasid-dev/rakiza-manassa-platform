import { AtSign, Clock3, FileText, Loader2, Paperclip, Send } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type MentionCandidate = { id: number; fullName: string; unitId?: number | null };

const updateLabels: Record<string, string> = {
  acknowledged: "استلام وبدء التنفيذ",
  progress: "تحديث أو تعليق",
  submitted: "إرسال للمراجعة",
  returned: "إعادة للمكلف",
  approved: "اعتماد المهمة",
  overdue_marked: "تنبيه تأخر",
  reassignment_requested: "طلب إعادة إسناد",
  obstacle_reported: "بلاغ عائق",
  exception_decided: "قرار إداري",
};

export function findActiveMention(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;
  return { start: beforeCursor.lastIndexOf("@"), query: match[1] || "" };
}

export function insertMentionToken(text: string, cursor: number, mentionStart: number, fullName: string) {
  const remainingText = text.slice(cursor);
  const token = `@${fullName}${remainingText && !/^\s/.test(remainingText) ? " " : ""}`;
  return { value: `${text.slice(0, mentionStart)}${token}${remainingText}`, cursor: mentionStart + token.length };
}

export function TaskCommentTimelinePanel({ taskId, candidates }: { taskId: number; candidates: MentionCandidate[] }) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<{ originalName: string; mimeType: string; contentBase64: string } | null>(null);
  const [mentionedProfileIds, setMentionedProfileIds] = useState<number[]>([]);
  const [activeMention, setActiveMention] = useState<{ start: number; query: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timeline = trpc.court.tasks.timeline.useQuery({ taskId });
  const addProgressNote = trpc.court.tasks.addProgressNote.useMutation({
    onSuccess: () => {
      setNote("");
      setAttachment(null);
      setMentionedProfileIds([]);
      utils.court.tasks.timeline.invalidate({ taskId });
      utils.court.tasks.list.invalidate();
      toast.success("تمت إضافة التعليق إلى سجل المهمة.");
    },
  });

  const addAttachment = (file: File) => {
    if (file.size > 8 * 1024 * 1024) { toast.error("حجم المرفق يتجاوز 8 ميغابايت."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      setAttachment({ originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: result.includes(",") ? result.split(",")[1] || "" : result });
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!note.trim()) return;
    addProgressNote.mutate({ taskId, note: note.trim(), attachment: attachment || undefined, mentionedProfileIds: mentionedProfileIds.length ? mentionedProfileIds : undefined });
  };

  const suggestedMentions = activeMention
    ? candidates.filter(person => person.fullName.toLocaleLowerCase().includes(activeMention.query.toLocaleLowerCase())).slice(0, 8)
    : [];

  const updateNote = (value: string, cursor: number) => {
    setNote(value);
    setActiveMention(findActiveMention(value, cursor));
  };

  const chooseMention = (person: MentionCandidate) => {
    if (!activeMention) return;
    const cursor = textareaRef.current?.selectionStart ?? note.length;
    const inserted = insertMentionToken(note, cursor, activeMention.start, person.fullName);
    setNote(inserted.value);
    setMentionedProfileIds(current => current.includes(person.id) ? current : [...current, person.id].slice(0, 10));
    setActiveMention(null);
    window.requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(inserted.cursor, inserted.cursor); });
  };

  return <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <div className="rounded-[1.35rem] border border-[#d8e5da] bg-[#f8fbf8] p-4">
      <div className="flex items-start gap-2"><AtSign className="mt-0.5 h-4 w-4 text-[#2f7653]" /><div><p className="text-sm font-bold text-[#12352f]">تعليق عادي وإشارة</p><p className="mt-1 text-xs leading-6 text-[#6d7d74]">يحفظ التعليق كتحديث عمل ولا يغير الحالة أو ينشئ طلب موافقة.</p></div></div>
      <div className="relative mt-3"><Textarea ref={textareaRef} value={note} onChange={event => updateNote(event.target.value, event.target.selectionStart ?? event.target.value.length)} onKeyUp={event => setActiveMention(findActiveMention(note, event.currentTarget.selectionStart ?? note.length))} placeholder="اكتب تعليقاً أو تحديثاً للمهمة… اكتب @ للإشارة إلى مستخدم" className="min-h-28 bg-white" />{activeMention && <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-xl border border-[#b8d2bd] bg-white p-1 shadow-lg" role="listbox" aria-label="اقتراحات الإشارة">{suggestedMentions.length ? suggestedMentions.map(person => <button key={person.id} type="button" role="option" onMouseDown={event => event.preventDefault()} onClick={() => chooseMention(person)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm text-[#214c39] hover:bg-[#edf7ee]"><AtSign className="h-4 w-4 text-[#2f7653]" />{person.fullName}</button>) : <p className="px-3 py-2 text-xs text-[#718078]">لا توجد نتائج مطابقة.</p>}</div>}</div>
      <div className="mt-3 grid gap-2">
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-[#b8d2bd] bg-white px-3 py-2 text-xs font-bold text-[#28623f]"><span className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0" />{attachment ? attachment.originalName : "إرفاق ملف مع التعليق"}</span><input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg,.docx,.xlsx" onChange={event => { const file = event.target.files?.[0]; if (file) addAttachment(file); }} /></label>
        <div><p className="text-xs font-bold text-[#53675d]">المستخدمون المشار إليهم <span className="font-normal">(اكتب @ للبحث، حتى 10)</span></p>{mentionedProfileIds.length > 0 ? <div className="mt-2 flex flex-wrap gap-1">{mentionedProfileIds.map(profileId => { const person = candidates.find(candidate => candidate.id === profileId); return <button key={profileId} type="button" onClick={() => setMentionedProfileIds(current => current.filter(id => id !== profileId))} className="rounded-full bg-[#e8f3e9] px-2 py-1 text-[11px] font-bold text-[#28623f]">@{person?.fullName || "مستخدم"} ×</button>; })}</div> : <p className="mt-1 text-[11px] text-[#718078]">ستظهر الاقتراحات فور كتابة علامة @ داخل التعليق.</p>}{mentionedProfileIds.length > 0 && <p className="mt-2 text-[11px] leading-5 text-[#53675d]">سيصل تنبيه داخل المنصة للمستخدمين المشار إليهم.</p>}</div>
      </div>
      <Button type="button" size="sm" disabled={!note.trim() || addProgressNote.isPending} onClick={submit} className="mt-3 bg-[#12352f] hover:bg-[#1d5245]"><Send className="ml-1 h-4 w-4" />{addProgressNote.isPending ? "جارٍ الحفظ…" : "إضافة تعليق عادي"}</Button>
      {addProgressNote.error && <p className="mt-2 text-xs text-[#a04a35]">{addProgressNote.error.message}</p>}
    </div>
    <div className="rounded-[1.35rem] border border-[#d8e5da] bg-white p-4">
      <div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 text-[#8a6731]" /><div><p className="text-sm font-bold text-[#12352f]">السجل الزمني للمهمة</p><p className="mt-1 text-xs leading-6 text-[#6d7d74]">يوضح التحديثات والإحالات والأسباب والمرفقات المسجلة.</p></div></div>
      {timeline.isLoading ? <p className="mt-4 flex items-center gap-2 text-xs text-[#6d7d74]"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تحميل السجل…</p> : timeline.data?.length ? <ol className="mt-4 space-y-3 border-r border-[#d8e5da] pr-4">{timeline.data.map(item => <li key={item.id} className="relative"><span className="absolute -right-[1.34rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[#2f7653] ring-4 ring-[#f3f8f3]" /><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-xs font-bold text-[#214c39]">{updateLabels[item.updateType] || "تحديث المهمة"}</span><span className="text-[10px] text-[#718078]">{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</span></div><p className="mt-1 text-xs font-bold text-[#53675d]">بواسطة: {item.actorName}</p>{item.note && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#344b3e]">{item.note}</p>}{item.mentions.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.mentions.map(mention => <span key={mention.profileId} className="rounded-full bg-[#e8f3e9] px-2 py-0.5 text-[11px] font-bold text-[#28623f]">@{mention.fullName}</span>)}</div>}{item.attachments.length > 0 && <div className="mt-2 space-y-1">{item.attachments.map(file => <a key={file.id} href={file.storageUrl ?? undefined} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1 text-xs font-bold text-[#28623f] underline"><FileText className="h-3.5 w-3.5" />{file.originalName}</a>)}</div>}</li>)}</ol> : <p className="mt-4 rounded-xl border border-dashed border-[#d9e4da] px-3 py-6 text-center text-xs text-[#718078]">لا توجد أحداث مسجلة لهذه المهمة بعد.</p>}
      {timeline.error && <p className="mt-2 text-xs text-[#a04a35]">{timeline.error.message}</p>}
    </div>
  </section>;
}
