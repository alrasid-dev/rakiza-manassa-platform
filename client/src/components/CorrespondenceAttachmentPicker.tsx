import { Paperclip, X } from "lucide-react";
import { canAddCorrespondenceAttachments, MAX_CORRESPONDENCE_ATTACHMENT_COUNT } from "@/lib/correspondenceAttachments";
import { MAX_UPLOAD_SIZE, MAX_UPLOAD_SIZE_LABEL } from "@shared/const";

export type CorrespondenceAttachmentDraft = {
  originalName: string;
  mimeType: string;
  contentBase64: string;
};

const MAX_ATTACHMENT_BYTES = MAX_UPLOAD_SIZE;

export function CorrespondenceAttachmentPicker({ attachments, onChange, disabled = false }: { attachments: CorrespondenceAttachmentDraft[]; onChange: (next: CorrespondenceAttachmentDraft[]) => void; disabled?: boolean }) {
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (!canAddCorrespondenceAttachments(attachments.length, selected.length)) {
      window.alert(`يمكن إرفاق ${MAX_CORRESPONDENCE_ATTACHMENT_COUNT} ملفات كحد أقصى مع الطلب.`);
      return;
    }
    const oversized = selected.find(file => file.size > MAX_ATTACHMENT_BYTES);
    if (oversized) {
      window.alert(`يتجاوز الملف «${oversized.name}» الحد المسموح وهو ${MAX_UPLOAD_SIZE_LABEL}.`);
      return;
    }
    Promise.all(selected.map(file => new Promise<CorrespondenceAttachmentDraft>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("تعذر قراءة المرفق."));
      reader.onload = () => {
        const value = String(reader.result || "");
        resolve({ originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: value.includes(",") ? value.split(",")[1] || "" : value });
      };
      reader.readAsDataURL(file);
    }))).then(next => onChange([...attachments, ...next])).catch(error => window.alert(error.message));
  };

  return <section className="rounded-xl border border-dashed border-[#b8d2bd] bg-[#f9fcf8] p-3" aria-label="مرفقات الطلب">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#2b5a48]">مرفقات الطلب <span className="font-normal text-[var(--rakiza-muted)]">(اختياري)</span></p><p className="mt-1 text-[11px] leading-5 text-[var(--rakiza-muted)]">PDF أو Word أو Excel أو PNG/JPEG، حتى 5 ملفات وبحد {MAX_UPLOAD_SIZE_LABEL} للملف.</p></div><Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rakiza-olive-strong)]" /></div>
    <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-[#b9d2bd] bg-white px-3 py-2 text-xs font-bold text-[var(--rakiza-olive-strong)] disabled:pointer-events-none disabled:opacity-60"><input type="file" className="sr-only" multiple disabled={disabled} accept="application/pdf,image/png,image/jpeg,.docx,.xlsx" onChange={event => { addFiles(event.target.files); event.currentTarget.value = ""; }} />اختيار مرفقات</label>
    {attachments.length > 0 && <ul className="mt-3 space-y-1.5">{attachments.map((attachment, index) => <li key={`${attachment.originalName}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-xs text-[#405a4e]"><span className="min-w-0 truncate font-bold">{attachment.originalName}</span><button type="button" disabled={disabled} aria-label={`إزالة ${attachment.originalName}`} onClick={() => onChange(attachments.filter((_, current) => current !== index))} className="shrink-0 rounded p-1 text-[var(--rakiza-danger)] hover:bg-[var(--rakiza-surface-muted)] disabled:opacity-50"><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
  </section>;
}
