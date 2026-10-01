import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, Copy, Download, FileText, Loader2, Mail, RotateCw, Search, Share2, Sparkles, Volume2, VolumeX, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type TaskPreviewAttachment = { id: number; originalName: string; storageUrl: string | null; mimeType: string; sizeBytes?: number };

const languages = [
  { value: "en", label: "الإنجليزية" }, { value: "fr", label: "الفرنسية" }, { value: "ur", label: "الأوردية" },
  { value: "tr", label: "التركية" }, { value: "hi", label: "الهندية" }, { value: "bn", label: "البنغالية" },
] as const;

const isImage = (mimeType: string) => mimeType === "image/png" || mimeType === "image/jpeg";
const isPreviewable = (mimeType: string) => isImage(mimeType) || mimeType === "application/pdf";

function splitTextByQuery(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return [{ value: text, matches: false }];
  const normalizedText = text.toLocaleLowerCase();
  const normalizedNeedle = needle.toLocaleLowerCase();
  const parts: Array<{ value: string; matches: boolean }> = [];
  let cursor = 0;
  for (let matchAt = normalizedText.indexOf(normalizedNeedle, cursor); matchAt >= 0; matchAt = normalizedText.indexOf(normalizedNeedle, cursor)) {
    if (matchAt > cursor) parts.push({ value: text.slice(cursor, matchAt), matches: false });
    parts.push({ value: text.slice(matchAt, matchAt + needle.length), matches: true });
    cursor = matchAt + needle.length;
  }
  if (cursor < text.length) parts.push({ value: text.slice(cursor), matches: false });
  return parts.length ? parts : [{ value: text, matches: false }];
}

function copyText(value: string, label: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`تم نسخ ${label} إلى الحافظة.`),
    () => toast.error(`تعذر نسخ ${label}. حدده وانسخه يدوياً.`),
  );
}

export function TaskAttachmentPreviewDialog({ attachment, attachments, taskId, onClose }: { attachment: TaskPreviewAttachment; attachments: TaskPreviewAttachment[]; taskId: number | null; onClose: () => void }) {
  const [current, setCurrent] = useState(attachment);
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [textByAttachment, setTextByAttachment] = useState<Record<number, string>>({});
  const [editableTextByAttachment, setEditableTextByAttachment] = useState<Record<number, string>>({});
  const [translations, setTranslations] = useState<Record<number, { text: string; language: string }>>({});
  const [summaries, setSummaries] = useState<Record<number, { text: string; sourceKind: "extracted" | "translated" }>>({});
  const [search, setSearch] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<(typeof languages)[number]["value"]>("en");
  const [speakingKind, setSpeakingKind] = useState<"extracted" | "translated" | null>(null);
  const previewable = useMemo(() => attachments.filter(item => isPreviewable(item.mimeType)), [attachments]);
  const currentIndex = previewable.findIndex(item => item.id === current.id);
  const currentText = editableTextByAttachment[current.id] ?? textByAttachment[current.id];
  const currentTranslation = translations[current.id];
  const currentSummary = summaries[current.id];
  const matches = currentText ? splitTextByQuery(currentText, search) : [];
  const matchCount = matches.filter(part => part.matches).length;
  const extractProcedure = trpc.court.tasks.attachments?.extractText;
  const translateProcedure = trpc.court.tasks.attachments?.translateText;
  const summarizeProcedure = trpc.court.tasks.attachments?.summarizeText;
  const extractText = extractProcedure?.useMutation ? extractProcedure.useMutation({
    onSuccess: (result, input) => {
      setTextByAttachment(value => ({ ...value, [input.attachmentId]: result.text }));
      setEditableTextByAttachment(value => ({ ...value, [input.attachmentId]: result.text }));
      toast.success(result.text ? "تم استخراج النص من المرفق." : "لم يُعثر على نص قابل للاستخراج.");
    },
  }) : { isPending: false, error: null, mutate: () => toast.error("استخراج النص غير متاح في هذه النسخة.") };
  const translateText = translateProcedure?.useMutation ? translateProcedure.useMutation({
    onSuccess: (result, input) => {
      setTranslations(value => ({ ...value, [input.attachmentId]: { text: result.translation, language: result.targetLanguage } }));
      toast.success("تمت ترجمة النص المستخرج.");
    },
  }) : { isPending: false, error: null, mutate: () => toast.error("ترجمة النص غير متاحة في هذه النسخة.") };
  const summarizeText = summarizeProcedure?.useMutation ? summarizeProcedure.useMutation({
    onSuccess: (result, input) => { setSummaries(value => ({ ...value, [input.attachmentId]: { text: result.summary, sourceKind: result.sourceKind } })); toast.success("تم إنشاء ملخص النص."); },
  }) : { isPending: false, error: null, mutate: () => toast.error("تلخيص النص غير متاح في هذه النسخة.") };

  const selectAttachment = (next: TaskPreviewAttachment) => {
    setCurrent(next); setIsLoading(true); setScale(1); setRotation(0); setSearch("");
  };

  useEffect(() => { selectAttachment(attachment); }, [attachment]);
  useEffect(() => () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  const move = (direction: -1 | 1) => {
    if (!previewable.length) return;
    const next = previewable[(currentIndex + direction + previewable.length) % previewable.length];
    if (next) selectAttachment(next);
  };

  const stopSpeaking = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingKind(null);
  };

  const speak = (value: string, kind: "extracted" | "translated") => {
    if (!value.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) { toast.error("الاستماع الصوتي غير مدعوم في هذا المتصفح."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = kind === "translated" && currentTranslation ? ({ en: "en-US", fr: "fr-FR", ur: "ur-PK", tr: "tr-TR", hi: "hi-IN", bn: "bn-BD" }[currentTranslation.language] || "ar-SA") : "ar-SA";
    utterance.onend = () => setSpeakingKind(null);
    utterance.onerror = () => { setSpeakingKind(null); toast.error("تعذر تشغيل الاستماع الصوتي."); };
    setSpeakingKind(kind);
    window.speechSynthesis.speak(utterance);
  };

  const shareText = async (value: string, label: string) => {
    if (!value.trim()) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "نص من رَكيزة", text: value }); toast.success(`تمت مشاركة ${label}.`); } catch (error) { if ((error as DOMException).name !== "AbortError") toast.error("تعذرت المشاركة من هذا الجهاز."); }
      return;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent("نص من رَكيزة")}&body=${encodeURIComponent(value)}`;
  };

  const shareByEmail = (value: string) => {
    if (!value.trim()) return;
    window.location.href = `mailto:?subject=${encodeURIComponent("نص من رَكيزة")}&body=${encodeURIComponent(value)}`;
  };

  const downloadText = () => {
    if (!currentText) return;
    const baseName = current.originalName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "_").slice(0, 100) || "extracted-text";
    const url = URL.createObjectURL(new Blob([currentText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${baseName}-text.txt`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent dir="rtl" className="max-w-4xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-200 motion-reduce:animate-none">
      <DialogHeader><DialogTitle>معاينة المرفق</DialogTitle><DialogDescription>{current.originalName}</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button type="button" size="sm" variant="outline" disabled={previewable.length < 2} onClick={() => move(1)}><ChevronRight className="ml-1 h-4 w-4" />التالي</Button>
          <span className="text-xs font-bold text-[#53675d]">{currentIndex + 1} من {previewable.length} قابل للمعاينة</span>
          <Button type="button" size="sm" variant="outline" disabled={previewable.length < 2} onClick={() => move(-1)}><ChevronLeft className="ml-1 h-4 w-4" />السابق</Button>
        </div>
        <div className="relative grid min-h-[360px] place-items-center overflow-auto rounded-xl border border-[#e5ebe4] bg-[#f8faf8] p-3">
          {isLoading && <div className="absolute inset-0 z-10 grid place-items-center bg-[#f8faf8]/85 text-sm font-bold text-[#28623f]"><span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />جارٍ تحميل المرفق…</span></div>}
          {isImage(current.mimeType) ? <img src={current.storageUrl ?? undefined} alt={`معاينة ${current.originalName}`} onLoad={() => setIsLoading(false)} onError={() => setIsLoading(false)} className="max-h-[58vh] max-w-full object-contain transition-transform duration-200 ease-out motion-reduce:transition-none" style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }} /> : <iframe title={`معاينة ${current.originalName}`} src={current.storageUrl ? `${current.storageUrl}#view=FitH` : undefined} onLoad={() => setIsLoading(false)} className="h-[58vh] w-full rounded-lg border-0 bg-white" />}
        </div>
        {isImage(current.mimeType) && <div className="flex flex-wrap items-center justify-center gap-2" aria-label="أدوات معاينة الصورة">
          <Button type="button" size="sm" variant="outline" disabled={scale <= 0.5} onClick={() => setScale(value => Math.max(0.5, Number((value - 0.25).toFixed(2))))}><ZoomOut className="ml-1 h-4 w-4" />تصغير</Button>
          <span className="min-w-14 text-center text-xs font-bold text-[#53675d]">{Math.round(scale * 100)}%</span>
          <Button type="button" size="sm" variant="outline" disabled={scale >= 3} onClick={() => setScale(value => Math.min(3, Number((value + 0.25).toFixed(2))))}><ZoomIn className="ml-1 h-4 w-4" />تكبير</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw className="ml-1 h-4 w-4" />تدوير</Button>
        </div>}
        <section className="rounded-xl border border-[#dbe8dd] bg-[#f8fbf8] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold text-[#214c39]">النص المستخرج</p><p className="mt-1 text-[11px] text-[#718078]">يُعالج عند الطلب فقط ولا يُخزن ضمن المهمة.</p></div><Button type="button" size="sm" disabled={Boolean(currentText) || extractText.isPending || !taskId} onClick={() => taskId && extractText.mutate({ taskId, attachmentId: current.id })} className="bg-[#2f7653] hover:bg-[#245d41]"><Sparkles className="ml-1 h-4 w-4" />{extractText.isPending ? "جارٍ الاستخراج…" : currentText ? "تم استخراج النص" : "استخراج النص"}</Button></div>
          {currentText ? <div className="mt-3 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-[#718078]" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pr-9 bg-white" placeholder="ابحث داخل النص المستخرج" /></div><span className="self-center text-xs font-bold text-[#53675d]">{search.trim() ? `${matchCount} نتيجة` : ""}</span><Button type="button" size="sm" variant="outline" onClick={downloadText}><Download className="ml-1 h-4 w-4" />تنزيل TXT</Button><Button type="button" size="sm" variant="outline" onClick={() => copyText(currentText, "النص المستخرج")}><Copy className="ml-1 h-4 w-4" />نسخ</Button></div>
            <div><label className="mb-1 block text-xs font-bold text-[#53675d]">راجع وصحح النص قبل نسخه أو ترجمته</label><Textarea value={currentText} onChange={event => setEditableTextByAttachment(value => ({ ...value, [current.id]: event.target.value }))} className="min-h-36 bg-white text-sm leading-7" /></div>
            {search.trim() && <div className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-[#e4ebe5] bg-white p-3 text-sm leading-7 text-[#344b3e]">{matches.map((part, index) => part.matches ? <mark key={index} className="rounded bg-[#f8e8a8] px-0.5 text-[#344b3e]">{part.value}</mark> : <span key={index}>{part.value}</span>)}</div>}
            <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => speak(currentText, "extracted")}><Volume2 className="ml-1 h-4 w-4" />استمع للنص</Button>{speakingKind === "extracted" && <Button type="button" size="sm" variant="outline" onClick={stopSpeaking}><VolumeX className="ml-1 h-4 w-4" />إيقاف</Button>}<Button type="button" size="sm" variant="outline" disabled={summarizeText.isPending || !taskId} onClick={() => taskId && summarizeText.mutate({ taskId, attachmentId: current.id, text: currentText, sourceKind: "extracted" })}><Sparkles className="ml-1 h-4 w-4" />{summarizeText.isPending ? "جارٍ التلخيص…" : "تلخيص النص"}</Button><Button type="button" size="sm" variant="outline" onClick={() => shareText(currentText, "النص المستخرج")}><Share2 className="ml-1 h-4 w-4" />مشاركة</Button><Button type="button" size="sm" variant="outline" onClick={() => shareByEmail(currentText)}><Mail className="ml-1 h-4 w-4" />بريد</Button></div>
            <div className="flex flex-col gap-2 rounded-lg border border-[#dce8de] bg-white p-3 sm:flex-row sm:items-center"><select aria-label="لغة الترجمة" value={targetLanguage} onChange={event => setTargetLanguage(event.target.value as typeof targetLanguage)} className="h-9 rounded-md border border-[#cfded2] bg-white px-2 text-sm">{languages.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}</select><Button type="button" size="sm" disabled={translateText.isPending || !taskId} onClick={() => taskId && translateText.mutate({ taskId, attachmentId: current.id, text: currentText, targetLanguage })} className="bg-[#12352f] hover:bg-[#1d5245]"><Sparkles className="ml-1 h-4 w-4" />{translateText.isPending ? "جارٍ الترجمة…" : "ترجمة النص"}</Button></div>
            {currentTranslation && <div className="rounded-lg border border-[#dce8de] bg-white p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-[#214c39]">النص المترجم</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => copyText(currentTranslation.text, "النص المترجم")}><Copy className="ml-1 h-4 w-4" />نسخ</Button><Button type="button" size="sm" variant="outline" onClick={() => speak(currentTranslation.text, "translated")}><Volume2 className="ml-1 h-4 w-4" />استمع</Button>{speakingKind === "translated" && <Button type="button" size="sm" variant="outline" onClick={stopSpeaking}><VolumeX className="ml-1 h-4 w-4" />إيقاف</Button>}<Button type="button" size="sm" variant="outline" disabled={summarizeText.isPending || !taskId} onClick={() => taskId && summarizeText.mutate({ taskId, attachmentId: current.id, text: currentTranslation.text, sourceKind: "translated" })}><Sparkles className="ml-1 h-4 w-4" />تلخيص الترجمة</Button><Button type="button" size="sm" variant="outline" onClick={() => shareText(currentTranslation.text, "النص المترجم")}><Share2 className="ml-1 h-4 w-4" />مشاركة</Button><Button type="button" size="sm" variant="outline" onClick={() => shareByEmail(currentTranslation.text)}><Mail className="ml-1 h-4 w-4" />بريد</Button></div></div><Textarea readOnly value={currentTranslation.text} className="min-h-32 bg-white text-sm leading-7" /></div>}
            {currentSummary && <section className="rounded-lg border border-[#eadba7] bg-[#fffdf5] p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-[#725d1f]">ملخص مولد آلياً</p><p className="mt-1 text-[11px] text-[#88743b]">مبني على {currentSummary.sourceKind === "translated" ? "النص المترجم" : "النص المستخرج"}؛ راجعه قبل الاعتماد.</p></div><Button type="button" size="sm" variant="outline" onClick={() => copyText(currentSummary.text, "الملخص")}><Copy className="ml-1 h-4 w-4" />نسخ الملخص</Button></div><Textarea readOnly value={currentSummary.text} className="min-h-28 border-[#eadba7] bg-white text-sm leading-7" /></section>}
          </div> : <p className="mt-3 text-xs leading-6 text-[#718078]">اختر «استخراج النص» لقراءة محتوى الصورة أو PDF ثم البحث أو التنزيل أو الترجمة.</p>}
          {(extractText.error || translateText.error || summarizeText.error) && <p className="mt-2 text-xs text-[#a04a35]">{extractText.error?.message || translateText.error?.message || summarizeText.error?.message}</p>}
        </section>
        <section><p className="mb-2 text-xs font-bold text-[#53675d]">مرفقات المهمة</p><div className="flex gap-2 overflow-x-auto pb-1">{attachments.map(item => isPreviewable(item.mimeType) ? <button key={item.id} type="button" onClick={() => selectAttachment(item)} className={`w-20 shrink-0 rounded-lg border p-1 text-right ${item.id === current.id ? "border-[#26704d] bg-[#e9f5ea]" : "border-[#dce6dd] bg-white"}`} aria-label={`معاينة ${item.originalName}`}>{isImage(item.mimeType) ? <img src={item.storageUrl ?? undefined} alt="" className="h-12 w-full rounded object-cover" /> : <span className="grid h-12 place-items-center rounded bg-[#f1f5f1] text-[#a04a35]"><FileText className="h-5 w-5" /></span>}<span className="mt-1 block truncate text-[10px] font-bold text-[#53675d]">{item.originalName}</span></button> : <a key={item.id} href={item.storageUrl ?? undefined} target="_blank" rel="noreferrer" className="w-20 shrink-0 rounded-lg border border-[#dce6dd] bg-white p-1 text-right"><span className="grid h-12 place-items-center rounded bg-[#f1f5f1] text-[#8a6731]"><FileText className="h-5 w-5" /></span><span className="mt-1 block truncate text-[10px] font-bold text-[#53675d]">{item.originalName}</span></a>)}</div></section>
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>إغلاق</Button><a href={current.storageUrl ?? undefined} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center rounded-md bg-[#12352f] px-3 text-sm font-medium text-white hover:bg-[#1d5245]">فتح أو تنزيل الأصل</a></DialogFooter>
    </DialogContent>
  </Dialog>;
}
