import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { AlertCircle, FileSpreadsheet, FileText, UploadCloud } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

const wordMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
const excelMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
const zipMime = "application/zip" as const;

async function fileAsBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + 0x8000)));
  return btoa(text);
}

export function ReportUploadPage() {
  const utils = trpc.useUtils();
  const roles = trpc.court.myRoles.useQuery();
  const units = trpc.court.units.list.useQuery();
  const people = trpc.court.people.list.useQuery();
  const isPerformanceMonitor = roles.data?.includes("performance_monitor") ?? false;
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [unitId, setUnitId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [linkedTaskId, setLinkedTaskId] = useState("");
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [createTasksForTargetUnit, setCreateTasksForTargetUnit] = useState(false);
  const selectedProfile = useMemo(() => people.data?.find(person => String(person.id) === profileId), [people.data, profileId]);
  const upload = trpc.court.reports.upload.useMutation({ onSuccess: result => { const distribution = result.distribution; toast.success(distribution ? `تمت قراءة التقرير وإنشاء ${distribution.createdTasks} مهمة موزعة داخل القسم المستهدف؛ يبقى تقييم التقرير بانتظار اعتماد المدير.` : `تم رفع التقرير وإحالته للمراجعة قبل تثبيت أي نقاط أو إغلاق للمهمة.`); setTitle(""); setFile(null); setLinkedTaskId(""); setPeriod("monthly"); setCreateTasksForTargetUnit(false); utils.court.dashboard.invalidate(); } });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return toast.error("اختر تقرير PDF أو Word أو Excel أو ZIP.");
    if (file.size > 8 * 1024 * 1024) return toast.error("الحد الأعلى لحجم التقرير هو 8 ميغابايت.");
    const extension = file.name.toLowerCase().split(".").pop();
    const mimeType = extension === "pdf" ? "application/pdf" : extension === "docx" ? wordMime : extension === "xlsx" ? excelMime : extension === "zip" ? zipMime : null;
    if (!mimeType) return toast.error("يسمح بملفات PDF أو Word بصيغة DOCX أو Excel بصيغة XLSX أو ZIP.");
    if (createTasksForTargetUnit && mimeType === zipMime) return toast.error("لا يمكن تحويل حزمة ZIP إلى مهام؛ ارفع PDF أو DOCX أو XLSX لذلك.");
    if (createTasksForTargetUnit && !unitId) return toast.error("اختر القسم المستهدف قبل تحويل تقرير مراقبة الأداء إلى مهام.");
    upload.mutate({ title: title.trim() || file.name.replace(/\.[^.]+$/, ""), originalName: file.name, mimeType, contentBase64: await fileAsBase64(file), unitId: unitId ? Number(unitId) : undefined, profileId: isPerformanceMonitor && profileId ? Number(profileId) : undefined, linkedTaskId: linkedTaskId ? Number(linkedTaskId) : undefined, reportPeriod: period, createTasksForTargetUnit: isPerformanceMonitor && createTasksForTargetUnit });
  };

  return <DashboardLayout><section className="mx-auto max-w-3xl"><header className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.14em] text-[#4a785a]">تقارير الإنجاز</p><h1 className="mt-2 text-3xl font-bold text-[var(--rakiza-ink)]">رفع تقرير وإثبات إنجاز</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[#52685d]">ارفع التقرير، وسيرتبط بإنجازك أو بالمهمة المحددة.</p></div><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e1ebe0] text-[var(--rakiza-olive-strong)]"><UploadCloud className="h-6 w-6" /></div></header>
    <form onSubmit={submit} className="mt-7 rounded-[1.6rem] border border-[#d1dbcf] bg-[var(--rakiza-surface)] p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)] sm:p-7"><div className="grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><Label htmlFor="report-title">عنوان التقرير</Label><Input id="report-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="مثال: تقرير إنجاز المهام اليومية" className="mt-2" /></div><div className="sm:col-span-2"><Label htmlFor="report-file">ملف التقرير</Label><label htmlFor="report-file" className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#9fbea5] bg-[#eef2eb] p-4 text-base text-[#3e5c4d]"><FileText className="h-5 w-5 text-[var(--rakiza-olive)]" /><span>{file ? file.name : "اختر PDF أو DOCX أو XLSX أو ZIP (حتى 8 ميغابايت)"}</span></label><input id="report-file" type="file" accept=".pdf,.docx,.xlsx,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip" className="sr-only" onChange={event => setFile(event.target.files?.[0] ?? null)} /></div><div><Label htmlFor="report-period">دورية التقرير</Label><select id="report-period" value={period} onChange={event => setPeriod(event.target.value as "daily" | "weekly" | "monthly")} className="mt-2 h-11 w-full rounded-md border border-input bg-transparent px-3 text-base"><option value="daily">يومي</option><option value="weekly">أسبوعي</option><option value="monthly">شهري</option></select><p className="mt-1 text-sm text-[#66766e]">حدد الفترة التي يغطيها التقرير لتظهر في القياس والإخراج.</p></div><div><Label htmlFor="report-unit">القسم أو الوحدة</Label><select id="report-unit" value={unitId} onChange={event => setUnitId(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-input bg-transparent px-3 text-base"><option value="">وحدتي المرتبطة تلقائياً</option>{units.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></div><div><Label htmlFor="report-task">رقم المهمة (اختياري)</Label><Input id="report-task" type="number" min="1" value={linkedTaskId} onChange={event => setLinkedTaskId(event.target.value)} placeholder="يربط التقرير بمهمة مسندة" className="mt-2" /></div>{isPerformanceMonitor && <div className="sm:col-span-2"><Label htmlFor="report-profile">تسجيل التقرير لصالح موظف أو قسم</Label><select id="report-profile" value={profileId} onChange={event => setProfileId(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-input bg-transparent px-3 text-base"><option value="">ملفي الشخصي</option>{people.data?.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select>{selectedProfile && <p className="mt-2 text-sm text-[#697a72]">سيُسجل التقرير لصالح: {selectedProfile.fullName}</p>}<label className="mt-4 flex items-start gap-3 rounded-xl border border-[#c7dcc8] bg-[#eef5ec] p-4 text-base text-[#365a46]"><input aria-label="تحويل التقرير إلى مهام موزعة" type="checkbox" checked={createTasksForTargetUnit} onChange={event => setCreateTasksForTargetUnit(event.target.checked)} className="mt-1" /><span><strong>حوّل التقرير إلى مهام موزعة داخل القسم المختار</strong><br /><small>يستخرج النظام البنود العملية، ويستبعد الموظفين المجازين ثم يوزعها بالتساوي بحسب أقل حمل عمل. لا تعمل هذه الخاصية مع ZIP.</small></span></label></div>}</div><div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#e9eee6] p-4 text-sm leading-6 text-[#52685d]"><span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-[var(--rakiza-olive)]" />PDF · DOCX · XLSX · ZIP</span><Button type="submit" disabled={upload.isPending} className="bg-[var(--rakiza-olive)] hover:bg-[var(--rakiza-olive-strong)]">{upload.isPending ? "جارٍ حفظ التقرير…" : "رفع التقرير"}</Button></div>{upload.error && <p className="mt-4 flex gap-2 text-sm text-[var(--rakiza-danger)]"><AlertCircle className="h-4 w-4 shrink-0" />{upload.error.message}</p>}</form></section></DashboardLayout>;
}
