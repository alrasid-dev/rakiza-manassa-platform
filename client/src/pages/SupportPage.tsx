import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, CircleDashed, ImagePlus, MessageSquareText, Send, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const statusLabels = { open: "بانتظار الإسناد", in_progress: "قيد المعالجة", resolved: "تمت المعالجة", closed: "مغلقة", escalated_to_manager: "مصعّدة لمدير الدعم", escalated_to_president: "محالة للرئيس" } as const;
const statusTone = { open: "bg-[#eef1f0] text-[#596c63]", in_progress: "bg-[#e7f2ea] text-[#17623a]", resolved: "bg-[#e8f0fa] text-[#315d8e]", closed: "bg-[#f2efea] text-[#6c665e]", escalated_to_manager: "bg-[#fff1df] text-[#9b641e]", escalated_to_president: "bg-[#fae8e5] text-[#a04838]" } as const;
type AttachmentDraft = { originalName: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; contentBase64: string };

export function SupportPage() {
  const utils = trpc.useUtils();
  const roles = trpc.court.myRoles.useQuery();
  const tickets = trpc.court.support.list.useQuery();
  const [form, setForm] = useState({ title: "", description: "", priority: "normal" as "normal" | "high" | "critical" });
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [resolution, setResolution] = useState("");
  const detail = trpc.court.support.detail.useQuery({ ticketId: selectedTicketId ?? 1 }, { enabled: Boolean(selectedTicketId) });
  const canActAsSupport = roles.data?.some(role => ["court_president", "assistant_president", "technical_support_manager", "technical_support_agent"].includes(role)) ?? false;
  const create = trpc.court.support.create.useMutation({ onSuccess: result => { toast.success(result.assignedSupportProfileId ? `تم تسجيل التذكرة #${result.ticketId} وإسنادها تلقائياً.` : `تم تسجيل التذكرة #${result.ticketId} بانتظار موظف دعم.`); setForm({ title: "", description: "", priority: "normal" }); setAttachments([]); utils.court.support.list.invalidate(); } });
  const addComment = trpc.court.support.comment.useMutation({ onSuccess: () => { setComment(""); setIsInternal(false); detail.refetch(); utils.court.support.list.invalidate(); } });
  const resolve = trpc.court.support.resolve.useMutation({ onSuccess: () => { toast.success("تمت معالجة التذكرة وتسجيل الإنجاز."); setResolution(""); detail.refetch(); utils.court.support.list.invalidate(); } });

  async function readAttachments(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files).slice(0, 3 - attachments.length);
    const converted = await Promise.all(selected.map(file => new Promise<AttachmentDraft | null>(finish => {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) { toast.error("يسمح فقط بصور PNG أو JPG أو WEBP حتى 2 ميجابايت للصورة."); finish(null); return; }
      const reader = new FileReader();
      reader.onload = () => finish({ originalName: file.name, mimeType: file.type as AttachmentDraft["mimeType"], contentBase64: String(reader.result).split(",")[1] ?? "" });
      reader.readAsDataURL(file);
    })));
    setAttachments(current => [...current, ...converted.filter((item): item is AttachmentDraft => Boolean(item))].slice(0, 3));
  }

  return <DashboardLayout><section className="mx-auto max-w-7xl">
    <header className="rounded-[1.7rem] bg-[#123b32] p-6 text-white shadow-[0_18px_40px_rgba(18,59,50,0.18)] sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold tracking-[0.16em] text-[#e1bd74]">قسم مستقل</p><h1 className="mt-2 text-3xl font-bold">الدعم التقني</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[#dbe9df]">سجل الإشكال وارفق صورة عند الحاجة. توزع التذكرة تلقائياً بالتساوي على موظفي الدعم وتتابع ضمن مهلة معالجة واضحة.</p></div><div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-[#f3d184]"><Wrench className="h-7 w-7" /></div></div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/10 px-3 py-1.5">المعالجة الأولى: 72 ساعة</span><span className="rounded-full bg-white/10 px-3 py-1.5">تصعيد مدير الدعم: 24 ساعة</span><span className="rounded-full bg-white/10 px-3 py-1.5">إحالة قيادية عند التأخر</span></div>
    </header>
    <div className="mt-6 grid gap-6 xl:grid-cols-[23rem_minmax(0,1fr)]">
      <form onSubmit={event => { event.preventDefault(); create.mutate({ ...form, attachments: attachments.length ? attachments : undefined }); }} className="h-fit rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]">
        <div className="flex items-center gap-2 text-[#12352f]"><MessageSquareText className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">تسجيل تذكرة جديدة</h2></div><p className="mt-2 text-xs leading-6 text-[#718078]">لا تُدرج بيانات حساسة غير لازمة. استخدم المرفقات لشرح خطأ الشاشة فقط.</p>
        <div className="mt-5 space-y-3">
          <label className="block text-xs font-bold text-[#63736a]">العنوان<input required minLength={5} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="مثال: تعذر فتح المهمة المسندة" className="mt-1 h-10 w-full rounded-lg border border-[#dedbd3] px-3 text-sm font-normal" /></label>
          <label className="block text-xs font-bold text-[#63736a]">وصف الإشكال<textarea required minLength={10} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="ما الذي حدث؟ وما الخطوة التي سبقت ظهور الإشكال؟" className="mt-1 min-h-28 w-full rounded-lg border border-[#dedbd3] p-3 text-sm font-normal" /></label>
          <label className="block text-xs font-bold text-[#63736a]">الأولوية<select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value as typeof form.priority })} className="mt-1 h-10 w-full rounded-lg border border-[#dedbd3] px-3 text-sm font-normal"><option value="normal">عادية</option><option value="high">مرتفعة</option><option value="critical">حرجة</option></select></label>
          <label className="block cursor-pointer rounded-xl border border-dashed border-[#c5d2c8] bg-[#f7faf7] p-3 text-xs font-bold text-[#3d6654]"><span className="flex items-center gap-2"><ImagePlus className="h-4 w-4" />إرفاق صور للشاشة (حتى 3 صور)</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => void readAttachments(event.target.files)} className="sr-only" /></label>
          {attachments.length > 0 && <div className="flex flex-wrap gap-2">{attachments.map((attachment, index) => <button type="button" onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))} key={`${attachment.originalName}-${index}`} className="rounded-lg bg-[#eef3ee] px-2 py-1 text-[11px] text-[#4b6257]">{attachment.originalName} ×</button>)}</div>}
        </div>
        <Button disabled={create.isPending} className="mt-5 w-full bg-[#006c35] hover:bg-[#00542a]">{create.isPending ? "جارٍ تسجيل التذكرة…" : "إرسال تذكرة الدعم"}</Button>{create.error && <p className="mt-3 text-xs text-[#a04635]">{create.error.message}</p>}
      </form>
      <div className="rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-[#b18448]">متابعة التذاكر</p><h2 className="mt-1 text-xl font-bold text-[#12352f]">{canActAsSupport ? "تذاكر نطاق الدعم" : "تذاكرك المسجلة"}</h2></div><span className="rounded-full bg-[#eef3ee] px-3 py-1 text-xs font-bold text-[#436451]">{tickets.data?.length ?? 0} تذكرة</span></div>
        {tickets.isLoading ? <div className="mt-8 flex items-center gap-2 text-sm text-[#708078]"><CircleDashed className="h-4 w-4 animate-spin" /> جارٍ تحميل التذاكر…</div> : tickets.data?.length ? <div className="mt-5 space-y-3">{tickets.data.map(({ ticket, requesterName }) => <button type="button" key={ticket.id} onClick={() => { setSelectedTicketId(ticket.id); setResolution(""); }} className={`w-full rounded-xl border p-4 text-right transition hover:border-[#a9c5af] ${selectedTicketId === ticket.id ? "border-[#006c35] bg-[#f4f8f4]" : "border-[#ebe6db] bg-[#fffefd]"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-[#26473a]">#{ticket.id} · {ticket.title}</p><p className="mt-1 text-xs text-[#718078]">{canActAsSupport ? `مقدمها: ${requesterName ?? "—"}` : "تذكرة تخص حسابك"} · تستحق {new Date(ticket.dueAt).toLocaleString("ar-SA")}</p></div><span className={`rounded-full px-3 py-1 text-[11px] font-bold ${statusTone[ticket.status]}`}>{statusLabels[ticket.status]}</span></div></button>)}</div> : <div className="mt-7 rounded-xl border border-dashed border-[#d7ddd7] p-8 text-center text-sm leading-7 text-[#748279]">لا توجد تذاكر في نطاقك حالياً.</div>}
        {selectedTicketId && <section className="mt-6 rounded-2xl border border-[#dce5dd] bg-[#fbfdfb] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-[#173d30]">تفاصيل التذكرة #{selectedTicketId}</h3>{detail.isLoading && <span className="text-xs text-[#748279]">جارٍ التحميل…</span>}</div>{detail.data && <><p className="mt-3 text-sm leading-7 text-[#50665a]">{detail.data.ticket.description}</p>{detail.data.attachments.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{detail.data.attachments.map(attachment => <a key={attachment.id} href={attachment.storageUrl ?? undefined} target="_blank" rel="noreferrer" className="rounded-lg border border-[#d8e2da] bg-white px-3 py-2 text-xs font-bold text-[#31644c]">عرض: {attachment.originalName}</a>)}</div>}<div className="mt-5 space-y-3">{detail.data.comments.map(({ comment: item, authorName }) => <article key={item.id} className={`rounded-xl p-3 ${item.isInternal ? "bg-[#fff5e6]" : "bg-white"}`}><p className="text-xs font-bold text-[#335349]">{authorName ?? "مستخدم المنصة"}{item.isInternal && " · ملاحظة داخلية"}</p><p className="mt-1 text-sm leading-6 text-[#52655b]">{item.body}</p></article>)}</div><form onSubmit={event => { event.preventDefault(); addComment.mutate({ ticketId: selectedTicketId, body: comment, isInternal }); }} className="mt-5"><textarea required minLength={2} value={comment} onChange={event => setComment(event.target.value)} placeholder="أضف تعليقاً أو تحديثاً" className="min-h-20 w-full rounded-xl border border-[#dbe1dc] bg-white p-3 text-sm" />{canActAsSupport && <label className="mt-2 flex items-center gap-2 text-xs text-[#61726a]"><input type="checkbox" checked={isInternal} onChange={event => setIsInternal(event.target.checked)} />ملاحظة داخلية لا تظهر لمقدم التذكرة</label>}<Button disabled={addComment.isPending} type="submit" size="sm" className="mt-3 bg-[#2c6a50] hover:bg-[#245840]"><Send className="ml-1 h-3.5 w-3.5" />إرسال التحديث</Button></form>{canActAsSupport && !["resolved", "closed"].includes(detail.data.ticket.status) && <form onSubmit={event => { event.preventDefault(); resolve.mutate({ ticketId: selectedTicketId, resolutionNote: resolution }); }} className="mt-5 rounded-xl border border-[#c9dfce] bg-[#eef7ef] p-4"><div className="flex items-center gap-2 text-sm font-bold text-[#27603d]"><CheckCircle2 className="h-4 w-4" />إغلاق ومعالجة التذكرة</div><textarea required minLength={3} value={resolution} onChange={event => setResolution(event.target.value)} placeholder="اكتب الإجراء الذي تم لمعالجة الإشكال" className="mt-3 min-h-20 w-full rounded-lg border border-[#d4e2d7] bg-white p-3 text-sm" /><Button disabled={resolve.isPending} type="submit" size="sm" className="mt-3 bg-[#15713b] hover:bg-[#0e5e2e]">{resolve.isPending ? "جارٍ الإغلاق…" : "تأكيد المعالجة"}</Button></form>}</>}</section>}
      </div>
    </div>
  </section></DashboardLayout>;
}
