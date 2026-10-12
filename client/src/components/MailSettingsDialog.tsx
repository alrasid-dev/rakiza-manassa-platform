import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ImagePlus, ShieldCheck, Sparkles, Star, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

const categoryOptions = ["عاجل", "متابعة", "معلومات", "سري"];
type AssistantMode = "off" | "draft" | "auto_reply" | "auto_forward";
type AssistantReplyTone = "formal" | "concise";

function imageAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("تعذر قراءة صورة التوقيع."));
    reader.readAsDataURL(file);
  });
}

export default function MailSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const preferences = trpc.court.internalMail.preferences.useQuery(undefined, { enabled: open });
  const [signature, setSignature] = useState("");
  const [name, setName] = useState("");
  const [subjectContains, setSubjectContains] = useState("");
  const [senderContains, setSenderContains] = useState("");
  const [action, setAction] = useState<"star" | "archive" | "category">("category");
  const [category, setCategory] = useState("متابعة");
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("off");
  const [assistantReplyTone, setAssistantReplyTone] = useState<AssistantReplyTone>("formal");
  const [assistantFilter, setAssistantFilter] = useState("");
  const [assistantRecipientSearch, setAssistantRecipientSearch] = useState("");
  const [assistantForwardProfileId, setAssistantForwardProfileId] = useState<number | null>(null);
  const [assistantForwardName, setAssistantForwardName] = useState("");
  const [assistantAuthorized, setAssistantAuthorized] = useState(false);
  const forwardPeople = trpc.court.communications.peopleSearch.useQuery({ query: assistantRecipientSearch || undefined }, { enabled: open && assistantMode === "auto_forward" && assistantRecipientSearch.trim().length >= 2 });

  useEffect(() => {
    if (!open) return;
    setSignature(preferences.data?.signature || "");
    setAssistantMode((preferences.data?.assistant?.mode || "off") as AssistantMode);
    setAssistantReplyTone((preferences.data?.assistant?.replyTone || "formal") as AssistantReplyTone);
    setAssistantFilter(preferences.data?.assistant?.subjectContains || "");
    setAssistantForwardProfileId(preferences.data?.assistant?.forwardProfileId || null);
    setAssistantForwardName("");
    setAssistantAuthorized(false);
  }, [open, preferences.data?.assistant?.forwardProfileId, preferences.data?.assistant?.mode, preferences.data?.assistant?.replyTone, preferences.data?.assistant?.subjectContains, preferences.data?.signature]);

  const refresh = () => utils.court.internalMail.preferences.invalidate();
  const updatePreferences = trpc.court.internalMail.updatePreferences.useMutation({ onSuccess: () => { toast.success("تم حفظ توقيع بريد ركيزة."); refresh(); }, onError: error => toast.error(error.message) });
  const uploadSignatureImage = trpc.court.internalMail.uploadSignatureImage.useMutation({ onSuccess: () => { toast.success("تم تحديث صورة التوقيع."); refresh(); }, onError: error => toast.error(error.message) });
  const updateAssistantPreferences = trpc.court.internalMail.updateAssistantPreferences.useMutation({ onSuccess: () => { setAssistantAuthorized(false); toast.success("تم حفظ تفضيلات مساعد بريد ركيزة."); refresh(); }, onError: error => toast.error(error.message) });
  const saveRule = trpc.court.internalMail.saveRule.useMutation({ onSuccess: () => { toast.success("تم حفظ قاعدة البريد."); setName(""); setSubjectContains(""); setSenderContains(""); refresh(); }, onError: error => toast.error(error.message) });
  const deleteRule = trpc.court.internalMail.deleteRule.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const updateContact = trpc.court.internalMail.updateContact.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const requiresAuthorization = assistantMode === "auto_reply" || assistantMode === "auto_forward";
  const saveAssistant = () => updateAssistantPreferences.mutate({ mode: assistantMode, replyTone: assistantReplyTone, forwardProfileId: assistantMode === "auto_forward" ? assistantForwardProfileId : null, subjectContains: assistantFilter.trim() || null, authorizationConfirmed: requiresAuthorization ? assistantAuthorized : undefined });
  const chooseSignatureImage = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) { toast.error("اختر صورة PNG أو JPEG أو WebP لا تتجاوز 2 ميجابايت."); return; }
    try { uploadSignatureImage.mutate({ originalName: file.name, mimeType: file.type as "image/png" | "image/jpeg" | "image/webp", contentBase64: await imageAsBase64(file) }); } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تحضير صورة التوقيع."); }
  };

  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>إعدادات بريد ركيزة</DialogTitle><DialogDescription>تخصيص التوقيع والقواعد ونبرة الاقتراحات ومستوى تفويض مساعد البريد للحساب الحالي فقط.</DialogDescription></DialogHeader>
      <div className="space-y-5">
        <section><h3 className="text-sm font-black text-[var(--rakiza-ink)]">التوقيع الشخصي</h3><p className="mt-1 text-[11px] text-[#73857b]">يُضاف النص والصورة إلى نهاية الرسائل الجديدة والردود. الصورة محفوظة داخل المنصة ولا تقبل الروابط الخارجية.</p><textarea value={signature} onChange={event => setSignature(event.target.value)} placeholder="مثال: الاسم — القسم — التحية" className="mt-2 min-h-24 w-full rounded-xl border border-[#d9e5da] p-3 text-sm" /><div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" onClick={() => updatePreferences.mutate({ signature })} disabled={updatePreferences.isPending} className="rounded-lg border border-[#d4e1d5] px-3 py-2 text-xs font-black text-[#315f49] disabled:opacity-50">حفظ نص التوقيع</button><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#d4e1d5] px-3 py-2 text-xs font-black text-[#315f49]"><ImagePlus className="h-3.5 w-3.5" />{uploadSignatureImage.isPending ? "جارٍ رفع الصورة…" : "إضافة أو استبدال الصورة"}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => chooseSignatureImage(event.target.files?.[0])} /></label>{preferences.data?.signatureImageUrl ? <img src={preferences.data.signatureImageUrl} alt="صورة التوقيع الحالية" className="h-12 max-w-36 object-contain" /> : null}</div></section>
        <section className="border-t border-[#e8eee8] pt-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#246f47]" /><h3 className="text-sm font-black text-[var(--rakiza-ink)]">اقتراحات وتفويض مساعد البريد</h3></div><p className="mt-1 text-[11px] leading-5 text-[#73857b]">نبرة الرد تتحكم بالاقتراحات فقط. يمكن مراجعة الاقتراح وتحريره قبل إدراجه في المسودة، ولا يرسل المساعد شيئاً من هذا الإعداد.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-bold text-[#476358]">نبرة الردود المقترحة<select aria-label="نبرة الردود المقترحة" value={assistantReplyTone} onChange={event => setAssistantReplyTone(event.target.value as AssistantReplyTone)} className="mt-1 w-full rounded-lg border border-[#d9e5da] bg-white px-3 py-2 text-xs"><option value="formal">رسمية</option><option value="concise">مختصرة</option></select></label><label className="text-xs font-bold text-[#476358]">المستوى<select aria-label="مستوى تفويض مساعد البريد" value={assistantMode} onChange={event => { setAssistantMode(event.target.value as AssistantMode); setAssistantAuthorized(false); }} className="mt-1 w-full rounded-lg border border-[#d9e5da] bg-white px-3 py-2 text-xs"><option value="off">إيقاف التفويض</option><option value="draft">إنشاء مسودة ذكية للمراجعة</option><option value="auto_reply">رد تلقائي داخلي محدود</option><option value="auto_forward">تحويل تلقائي داخلي محدود</option></select></label><label className="text-xs font-bold text-[#476358] sm:col-span-2">قيد اختياري للموضوع<input value={assistantFilter} onChange={event => setAssistantFilter(event.target.value)} placeholder="مثال: طلب متابعة" className="mt-1 w-full rounded-lg border border-[#d9e5da] px-3 py-2 text-xs" /></label></div>{assistantMode === "auto_forward" ? <div className="mt-2 rounded-xl bg-[#f6faf6] p-3"><label className="text-xs font-bold text-[#476358]">مستلم التحويل الداخلي<input value={assistantRecipientSearch} onChange={event => setAssistantRecipientSearch(event.target.value)} placeholder="ابحث بالاسم" className="mt-1 w-full rounded-lg border border-[#d9e5da] bg-white px-3 py-2 text-xs" /></label>{assistantForwardName ? <p className="mt-2 text-xs font-bold text-[#246443]">المستلم المختار: {assistantForwardName}</p> : null}{assistantRecipientSearch.trim().length >= 2 ? <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-[#e0e9e1] bg-white p-1">{forwardPeople.data?.map((item: any) => <button type="button" key={item.profile.id} onClick={() => { setAssistantForwardProfileId(item.profile.id); setAssistantForwardName(item.profile.fullName); setAssistantRecipientSearch(""); }} className="block w-full rounded-md px-2 py-1.5 text-right text-xs hover:bg-[#eef6ef]">{item.profile.fullName}<span className="mr-1 text-[10px] text-[#7b8c83]">{item.unitName || ""}</span></button>)}</div> : null}</div> : null}{requiresAuthorization ? <label className="mt-3 flex items-start gap-2 rounded-xl border border-[#eedeb1] bg-[#fffdf4] p-3 text-xs leading-5 text-[#695b29]"><input type="checkbox" checked={assistantAuthorized} onChange={event => setAssistantAuthorized(event.target.checked)} className="mt-0.5" /><span><b>أؤكد التفويض الصريح.</b> قد ينشئ المساعد رداً أو تحويلاً باسم الهوية الحالية للرسائل الداخلية المطابقة فقط. لا يعمل على الرسائل السرية أو رسائل الذكاء الاصطناعي السابقة أو المرفقات، ويمكن إيقافه في أي وقت.</span></label> : null}<button type="button" disabled={updateAssistantPreferences.isPending || (assistantMode === "auto_forward" && !assistantForwardProfileId) || (requiresAuthorization && !assistantAuthorized)} onClick={saveAssistant} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0e6a40] px-3 py-2 text-xs font-black text-white disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" />{updateAssistantPreferences.isPending ? "جارٍ الحفظ…" : "حفظ تفضيلات المساعد"}</button></section>
        <section className="border-t border-[#e8eee8] pt-4"><h3 className="text-sm font-black text-[var(--rakiza-ink)]">قاعدة تنظيم جديدة</h3><p className="mt-1 text-[11px] text-[#73857b]">تُطبّق القاعدة على الرسائل الواردة الجديدة المطابقة لها.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={name} onChange={event => setName(event.target.value)} placeholder="اسم القاعدة" className="rounded-lg border border-[#d9e5da] px-3 py-2 text-xs" /><input value={subjectContains} onChange={event => setSubjectContains(event.target.value)} placeholder="الموضوع يتضمن" className="rounded-lg border border-[#d9e5da] px-3 py-2 text-xs" /><input value={senderContains} onChange={event => setSenderContains(event.target.value)} placeholder="المرسل يتضمن" className="rounded-lg border border-[#d9e5da] px-3 py-2 text-xs" /><select value={action} onChange={event => setAction(event.target.value as typeof action)} className="rounded-lg border border-[#d9e5da] bg-white px-3 py-2 text-xs"><option value="category">تعيين علامة</option><option value="star">إضافة إلى المفضلة</option><option value="archive">أرشفة تلقائية</option></select>{action === "category" && <select value={category} onChange={event => setCategory(event.target.value)} className="rounded-lg border border-[#d9e5da] bg-white px-3 py-2 text-xs">{categoryOptions.map(item => <option key={item}>{item}</option>)}</select>}</div><button type="button" onClick={() => saveRule.mutate({ name, subjectContains: subjectContains || null, senderContains: senderContains || null, action, category: action === "category" ? category : null, isEnabled: true })} className="mt-2 rounded-lg bg-[#0e6a40] px-3 py-2 text-xs font-black text-white">إضافة القاعدة</button><div className="mt-3 space-y-2">{preferences.data?.rules.map((rule: any) => <div key={rule.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#f6faf6] p-2 text-xs"><span><b>{rule.name}</b> — {rule.action === "category" ? `علامة ${rule.category}` : rule.action === "star" ? "إضافة للمفضلة" : "أرشفة"}</span><button type="button" onClick={() => deleteRule.mutate({ id: rule.id })} className="text-[#af4438]"><Trash2 className="h-4 w-4" /></button></div>)}</div></section>
        <section className="border-t border-[#e8eee8] pt-4"><h3 className="text-sm font-black text-[var(--rakiza-ink)]">جهات الاتصال المتكررة</h3><p className="mt-1 text-[11px] text-[#73857b]">تظهر تلقائياً بعد مراسلة زملائك، ويمكن تثبيت الأكثر استخداماً.</p><div className="mt-3 space-y-2">{preferences.data?.contacts.length ? preferences.data.contacts.map((contact: any) => <div key={contact.id} className="flex items-center justify-between rounded-lg bg-[#f6faf6] p-2 text-xs"><span><b>{contact.fullName}</b>{contact.jobTitle ? ` — ${contact.jobTitle}` : ""}</span><button type="button" onClick={() => updateContact.mutate({ contactProfileId: contact.contactProfileId, isFavorite: !contact.isFavorite })} className={contact.isFavorite ? "text-[#b18228]" : "text-[#90a198]"}><Star className="h-4 w-4" fill={contact.isFavorite ? "currentColor" : "none"} /></button></div>) : <p className="text-xs text-[#74877c]">ستظهر هنا جهات الاتصال بعد إرسال رسائل إليها.</p>}</div></section>
      </div>
      <DialogFooter><button type="button" onClick={onClose} className="rounded-lg border border-[#d4e1d5] px-3 py-2 text-xs font-black text-[#315f49]">إغلاق</button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
