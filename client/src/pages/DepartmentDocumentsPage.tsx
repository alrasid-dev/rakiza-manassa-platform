import DashboardLayout from "@/components/DashboardLayout";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Download, FileUp, FolderOpen, ListChecks, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const statusLabel: Record<string, string> = {
  new: "جديدة", in_progress: "قيد التنفيذ", under_review: "قيد المراجعة", completed: "مكتملة", overdue: "متأخرة", cancelled: "ملغاة",
};

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob(["\ufeff" + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function DepartmentDocumentsPage() {
  const utils = trpc.useUtils();
  const overview = trpc.court.departmentDocs.overview.useQuery();
  const createTask = trpc.court.departmentDocs.createTask.useMutation({
    onSuccess: async () => { await utils.court.departmentDocs.overview.invalidate(); setTaskOpen(false); setTaskForm({ unitId: "", title: "", assigneeProfileId: "" }); toast.success("تم إنشاء المهمة وإسنادها."); },
    onError: (error: { message?: string }) => toast.error(error.message || "تعذر إنشاء المهمة."),
  });
  const uploadDocument = trpc.court.departmentDocs.uploadDocument.useMutation({
    onSuccess: async () => { await utils.court.departmentDocs.overview.invalidate(); setUploadOpen(false); setUploadForm({ unitId: "", title: "" }); setFile(null); toast.success("تم رفع المستند للقسم."); },
    onError: (error: { message?: string }) => toast.error(error.message || "تعذر رفع المستند."),
  });

  const [unitFilter, setUnitFilter] = useState<string>("");
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ unitId: "", title: "", assigneeProfileId: "" });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ unitId: "", title: "" });
  const [file, setFile] = useState<File | null>(null);

  const units = overview.data?.units ?? [];
  const people = overview.data?.people ?? [];
  const templates = overview.data?.templates ?? [];
  const tasks = overview.data?.tasks ?? [];
  const documents = overview.data?.documents ?? [];

  const selectedUnit = unitFilter ? Number(unitFilter) : null;
  const visibleTemplates = useMemo(() => templates.filter(item => !selectedUnit || item.template.unitId === selectedUnit), [templates, selectedUnit]);
  const visibleTasks = useMemo(() => tasks.filter(task => !selectedUnit || task.unitId === selectedUnit), [tasks, selectedUnit]);
  const visibleDocuments = useMemo(() => documents.filter(doc => !selectedUnit || doc.unitId === selectedUnit), [documents, selectedUnit]);
  const visiblePeople = useMemo(() => people.filter(person => !selectedUnit || person.unitId === selectedUnit), [people, selectedUnit]);

  const submitTask = () => {
    if (!taskForm.unitId || !taskForm.title.trim()) { toast.error("اختر القسم واكتب عنوان المهمة."); return; }
    createTask.mutate({ unitId: Number(taskForm.unitId), title: taskForm.title, assigneeProfileId: taskForm.assigneeProfileId ? Number(taskForm.assigneeProfileId) : undefined });
  };

  const submitUpload = async () => {
    if (!uploadForm.unitId || !file) { toast.error("اختر القسم وملف المستند."); return; }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    uploadDocument.mutate({ unitId: Number(uploadForm.unitId), title: uploadForm.title || file.name, originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: base64 });
  };

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      units: units,
      templates: visibleTemplates.map(item => ({ unit: item.unitName, title: item.template.title, frequency: item.template.frequency, active: item.template.isActive })),
      tasks: visibleTasks.map(task => ({ unit: units.find(u => u.id === task.unitId)?.name ?? null, title: task.title, status: statusLabel[task.status] ?? task.status, assignee: task.assigneeProfileId, dueAt: task.dueAt })),
      documents: visibleDocuments.map(doc => ({ unit: doc.unitName, title: doc.title, originalName: doc.originalName, url: doc.url })),
    };
    downloadText(`مستندات-الأقسام-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json");
  };

  const inputClass = "mt-1 h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground";

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">سير العمل وخطة القسم</p>
            <h1 className="mt-2 text-3xl font-bold text-[#12352f]">مستندات الأقسام</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#65766d]">يعرض المدير مهام قسمه (الخطة والقالب) والمهام الفعلية والمستندات المرفوعة، ويمكنه إنشاء مهمة وإسنادها للموظفين أو رفع مستند أو تصدير كل شيء.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTaskOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#12352f] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#1e5045]"><Plus className="h-4 w-4" /> إضافة مهمة</button>
            <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#c6d4c7] bg-white px-3 py-2.5 text-xs font-bold text-[#2d6b4f] hover:bg-[#eef4ea]"><FileUp className="h-4 w-4" /> رفع ملف</button>
            <button type="button" onClick={exportJson} className="inline-flex items-center gap-1.5 rounded-xl border border-[#c6d4c7] bg-white px-3 py-2.5 text-xs font-bold text-[#2d6b4f] hover:bg-[#eef4ea]"><Download className="h-4 w-4" /> تصدير</button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e7e0d4] bg-white p-4 shadow-[0_10px_30px_rgba(30,51,42,0.05)]">
          <span className="text-xs font-bold text-[#6a786f]">تصفية حسب القسم:</span>
          <select value={unitFilter} onChange={event => setUnitFilter(event.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">كل الأقسام ضمن نطاقك</option>
            {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]">
            <div className="flex items-center gap-2 text-[#12352f]"><ListChecks className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">خطة القسم (قوالب المهام)</h2></div>
            {visibleTemplates.length === 0 && <p className="mt-4 text-sm text-[#8a6e32]">لا توجد قوالب مهام ضمن هذا النطاق بعد.</p>}
            <ul className="mt-4 space-y-2">
              {visibleTemplates.map(item => <li key={item.template.id} className="rounded-xl bg-[#f7f4ed] px-3 py-2 text-sm leading-6 text-[#12352f]"><span className="ml-2 text-[11px] font-bold text-[#b18448]">{item.unitName}</span>{item.template.title}</li>)}
            </ul>
          </section>

          <section className="rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]">
            <div className="flex items-center gap-2 text-[#12352f]"><FolderOpen className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">المهام الفعلية</h2></div>
            {visibleTasks.length === 0 && <p className="mt-4 text-sm text-[#8a6e32]">لا توجد مهام فعلية ضمن هذا النطاق بعد.</p>}
            <ul className="mt-4 space-y-2">
              {visibleTasks.slice(0, 50).map(task => <li key={task.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#f7f4ed] px-3 py-2 text-sm text-[#12352f]"><span className="truncate">{task.title}</span><span className="shrink-0 text-[11px] font-bold text-[#65766d]">{statusLabel[task.status] ?? task.status}</span></li>)}
            </ul>
          </section>
        </div>

        <section className="mt-5 rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5 shadow-[0_10px_30px_rgba(30,51,42,0.05)]">
          <div className="flex items-center gap-2 text-[#12352f]"><FileUp className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">مستندات القسم</h2></div>
          {visibleDocuments.length === 0 && <p className="mt-4 text-sm text-[#8a6e32]">لا توجد مستندات مرفوعة ضمن هذا النطاق بعد.</p>}
          <ul className="mt-4 space-y-2">
            {visibleDocuments.map(doc => <li key={doc.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#f7f4ed] px-3 py-2 text-sm text-[#12352f]"><div><span className="ml-2 text-[11px] font-bold text-[#b18448]">{doc.unitName}</span>{doc.title}<span className="mr-2 text-[11px] text-[#65766d]">({doc.originalName})</span></div>{doc.url ? <a href={doc.url} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] font-bold text-[#2d6b4f] underline">فتح</a> : null}</li>)}
          </ul>
        </section>

        <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
          <DialogContent dir="rtl" className="border-[#cfd7ca] bg-[#fbfaf6]">
            <DialogHeader><DialogTitle>إضافة مهمة للقسم</DialogTitle><DialogDescription>أنشئ مهمة وأسندها لأحد موظفي القسم، وستظهر في سير عمل القسم.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-[#6a786f]">القسم
                <select value={taskForm.unitId} onChange={event => setTaskForm({ ...taskForm, unitId: event.target.value })} className={inputClass}>
                  <option value="">اختر القسم</option>
                  {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-[#6a786f]">عنوان المهمة
                <input value={taskForm.title} onChange={event => setTaskForm({ ...taskForm, title: event.target.value })} className={inputClass} placeholder="مثال: متابعة طلب مستفيد" />
              </label>
              <label className="block text-xs font-bold text-[#6a786f]">إسناد لموظف (اختياري)
                <select value={taskForm.assigneeProfileId} onChange={event => setTaskForm({ ...taskForm, assigneeProfileId: event.target.value })} className={inputClass}>
                  <option value="">بدون إسناد</option>
                  {visiblePeople.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                </select>
              </label>
            </div>
            <DialogFooter className="gap-2">
              <button type="button" onClick={() => setTaskOpen(false)} className="rounded-lg border border-[#c6d4c7] px-3 py-2 text-xs font-black text-[#355d4b]">إلغاء</button>
              <button type="button" disabled={createTask.isPending} onClick={submitTask} className="rounded-lg bg-[#12352f] px-3 py-2 text-xs font-black text-white disabled:opacity-60">حفظ المهمة</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent dir="rtl" className="border-[#cfd7ca] bg-[#fbfaf6]">
            <DialogHeader><DialogTitle>رفع مستند للقسم</DialogTitle><DialogDescription>ارفع ملفاً ضمن مستندات القسم ليظهر في القائمة ويمكن تصديره لاحقاً.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-[#6a786f]">القسم
                <select value={uploadForm.unitId} onChange={event => setUploadForm({ ...uploadForm, unitId: event.target.value })} className={inputClass}>
                  <option value="">اختر القسم</option>
                  {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-[#6a786f]">عنوان المستند
                <input value={uploadForm.title} onChange={event => setUploadForm({ ...uploadForm, title: event.target.value })} className={inputClass} placeholder="مثال: خطة القسم الشهرية" />
              </label>
              <label className="block text-xs font-bold text-[#6a786f]">الملف
                <input type="file" onChange={event => setFile(event.target.files?.[0] ?? null)} className={inputClass} />
              </label>
            </div>
            <DialogFooter className="gap-2">
              <button type="button" onClick={() => setUploadOpen(false)} className="rounded-lg border border-[#c6d4c7] px-3 py-2 text-xs font-black text-[#355d4b]">إلغاء</button>
              <button type="button" disabled={uploadDocument.isPending} onClick={submitUpload} className="rounded-lg bg-[#12352f] px-3 py-2 text-xs font-black text-white disabled:opacity-60">رفع المستند</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </DashboardLayout>
  );
}
