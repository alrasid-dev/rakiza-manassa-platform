import { AlignCenter, AlignLeft, AlignRight, Bold, ImagePlus, Italic, Link2, List, ListOrdered, Paperclip, Palette, Underline } from "lucide-react";
import React, { ChangeEvent, useEffect, useRef, useState } from "react";

type RichTextMailEditorProps = { value: string; onChange: (html: string, plainText: string) => void; onFilesDropped: (files: FileList) => void; disabled?: boolean };
type Command = "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList" | "createLink" | "justifyRight" | "justifyCenter" | "justifyLeft" | "fontName" | "fontSize" | "foreColor";

export default function RichTextMailEditor({ value, onChange, onFilesDropped, disabled = false }: RichTextMailEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const emitValue = () => { const html = editorRef.current?.innerHTML || ""; const plainText = editorRef.current?.innerText || ""; onChange(html, plainText); };
  useEffect(() => { if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value; }, [value]);
  const run = (command: Command, value?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    if (command === "createLink") {
      const url = window.prompt("أدخل رابطاً آمناً يبدأ بـ https:// أو mailto:");
      if (!url || !/^(https?:|mailto:)/i.test(url)) return;
      document.execCommand("createLink", false, url);
    } else document.execCommand(command, false, value);
    emitValue();
  };
  const tools: Array<{ label: string; command: Command; icon: typeof Bold }> = [
    { label: "عريض", command: "bold", icon: Bold }, { label: "مائل", command: "italic", icon: Italic }, { label: "تسطير", command: "underline", icon: Underline }, { label: "قائمة نقطية", command: "insertUnorderedList", icon: List }, { label: "قائمة مرقمة", command: "insertOrderedList", icon: ListOrdered }, { label: "محاذاة يمين", command: "justifyRight", icon: AlignRight }, { label: "توسيط", command: "justifyCenter", icon: AlignCenter }, { label: "محاذاة يسار", command: "justifyLeft", icon: AlignLeft }, { label: "رابط", command: "createLink", icon: Link2 },
  ];
  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    onFilesDropped(files);
    editorRef.current?.focus();
    Array.from(files).filter(file => file.type.startsWith("image/")).forEach(file => document.execCommand("insertText", false, `[صورة مرفقة: ${file.name}] `));
    emitValue();
    event.target.value = "";
  };
  return <div className={`overflow-hidden rounded-xl border ${isDraggingFile ? "border-[#19834f] bg-[#f2fbf4]" : "border-[#c9d6c8] bg-[var(--rakiza-surface)]"}`}>
    <div className="flex flex-wrap items-center gap-1 border-b border-[#dce5da] bg-[#edf2eb] p-1.5">
      <select aria-label="نوع الخط" disabled={disabled} defaultValue="Tajawal" onChange={event => run("fontName", event.target.value)} className="h-8 rounded-lg border border-[#cddacb] bg-[var(--rakiza-surface)] px-2 text-xs font-bold text-[#315f49]"><option value="Tajawal">تاجوال</option><option value="Arial">Arial</option><option value="Tahoma">Tahoma</option><option value="serif">تقليدي</option></select>
      <select aria-label="حجم الخط" disabled={disabled} defaultValue="3" onChange={event => run("fontSize", event.target.value)} className="h-8 rounded-lg border border-[#cddacb] bg-[var(--rakiza-surface)] px-2 text-xs font-bold text-[#315f49]"><option value="2">صغير</option><option value="3">متوسط</option><option value="4">كبير</option><option value="5">أكبر</option></select>
      <label title="لون الخط" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[#3d6651] hover:bg-[#dfece0]"><Palette className="h-4 w-4" /><input aria-label="لون الخط" type="color" disabled={disabled} defaultValue="#245f43" onChange={event => run("foreColor", event.target.value)} className="sr-only" /></label>
      {tools.map(tool => { const Icon = tool.icon; return <button key={tool.command} type="button" disabled={disabled} title={tool.label} aria-label={tool.label} onMouseDown={event => event.preventDefault()} onClick={() => run(tool.command)} className="grid h-8 w-8 place-items-center rounded-lg text-[#3d6651] hover:bg-[#dfece0] disabled:opacity-50"><Icon className="h-4 w-4" /></button>; })}
      <button type="button" disabled={disabled} title="إدراج صورة كمرفق" aria-label="إدراج صورة كمرفق" onMouseDown={event => event.preventDefault()} onClick={() => imageInputRef.current?.click()} className="grid h-8 w-8 place-items-center rounded-lg text-[#3d6651] hover:bg-[#dfece0] disabled:opacity-50"><ImagePlus className="h-4 w-4" /></button>
      <input ref={imageInputRef} aria-label="اختيار صورة للإدراج" type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={addImages} />
      <span className="mr-auto hidden items-center gap-1.5 px-2 text-xs text-[#66776d] sm:inline-flex"><Paperclip className="h-3.5 w-3.5" />اسحب المرفقات أو أدخل صورة</span>
    </div>
    <div ref={editorRef} contentEditable={!disabled} role="textbox" aria-multiline="true" aria-label="محتوى الرسالة المنسق" data-placeholder="اكتب رسالتك… أو اسحب الملفات لإرفاقها" onInput={emitValue} onDragEnter={event => { event.preventDefault(); setIsDraggingFile(true); }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (event.currentTarget === event.target) setIsDraggingFile(false); }} onDrop={event => { event.preventDefault(); setIsDraggingFile(false); if (event.dataTransfer.files.length) onFilesDropped(event.dataTransfer.files); }} className="min-h-52 px-4 py-3 text-base leading-8 text-[#29463a] outline-none [&:empty]:before:pointer-events-none [&:empty]:before:text-[#829289] [&:empty]:before:content-[attr(data-placeholder)] [&_a]:text-[#166f9b] [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-r-2 [&_blockquote]:border-[#a8c9af] [&_blockquote]:pr-3 [&_li]:mr-5" />
  </div>;
}
