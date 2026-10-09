import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { CalendarClock, Plus, UserRoundCog } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const FREQUENCIES = [
  { value: "daily", label: "يومي" },
  { value: "weekly", label: "أسبوعي" },
  { value: "monthly", label: "شهري" },
  { value: "quarterly", label: "ربع سنوي" },
  { value: "yearly", label: "سنوي" },
  { value: "custom", label: "كل X أيام" },
  { value: "specific_days", label: "أيام محددة من الأسبوع" },
] as const;

type Frequency = (typeof FREQUENCIES)[number]["value"];
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function frequencyLabel(frequency: string): string {
  return FREQUENCIES.find(f => f.value === frequency)?.label ?? frequency;
}

function recurrenceLabel(t: { frequency: string; intervalDays: number | null; specificDays: number[] | null }): string {
  if (t.frequency === "specific_days" && Array.isArray(t.specificDays) && t.specificDays.length) return t.specificDays.map(d => DAY_NAMES[d] ?? d).join("، ");
  if (t.frequency === "custom" && t.intervalDays) return `كل ${t.intervalDays} أيام`;
  return frequencyLabel(t.frequency);
}

type TemplateRow = { template: { id: number; unitId: number | null; title: string; frequency: string; intervalDays: number | null; specificDays: number[] | null; dueHourLocal: number; defaultAssigneeProfileId: number | null; isActive: boolean }; unitName: string | null };

export default function PlannedTasksPage() {
  const utils = trpc.useUtils();
  const templates = trpc.court.templates.list.useQuery();
  const people = trpc.court.people.list.useQuery();
  const units = trpc.court.units.list.useQuery();
  const create = trpc.court.templates.create.useMutation({ onSuccess: () => { utils.court.templates.list.invalidate(); setAddOpen(false); resetAddForm(); toast.success("تم إضافة المهمة المخطَّطة."); }, onError: e => toast.error(e.message || "تعذر إضافة المهمة.") });
  const toggleActive = trpc.court.templates.toggleActive.useMutation({ onSuccess: () => utils.court.templates.list.invalidate(), onError: e => toast.error(e.message || "تعذر تحديث الحالة.") });
  const setAssignee = trpc.court.templates.setAssignee.useMutation({ onSuccess: () => { utils.court.templates.list.invalidate(); setReassignId(null); toast.success("تم إعادة الإسناد."); }, onError: e => toast.error(e.message || "تعذر إعادة الإسناد.") });

  const [unitFilter, setUnitFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [reassignId, setReassignId] = useState<number | null>(null);
  const [reassignProfileId, setReassignProfileId] = useState("");
  const [addForm, setAddForm] = useState({ unitId: "", title: "", frequency: "daily" as Frequency, assigneeProfileId: "", dueHourLocal: "13", intervalDays: 1, workdayOnly: true });
  const [specificDays, setSpecificDays] = useState<number[]>([]);

  const resetAddForm = () => { setAddForm({ unitId: "", title: "", frequency: "daily", assigneeProfileId: "", dueHourLocal: "13", intervalDays: 1, workdayOnly: true }); setSpecificDays([]); };

  const peopleById = useMemo(() => new Map((people.data ?? []).map(p => [p.id, p])), [people.data]);
  const rows: TemplateRow[] = (templates.data ?? []) as TemplateRow[];

  const filtered = useMemo(() => rows.filter(row => {
    if (unitFilter && String(row.template.unitId ?? "") !== unitFilter) return false;
    if (assigneeFilter && String(row.template.defaultAssigneeProfileId ?? "") !== assigneeFilter) return false;
    if (typeFilter && row.template.frequency !== typeFilter) return false;
    if (statusFilter === "active" && !row.template.isActive) return false;
    if (statusFilter === "inactive" && row.template.isActive) return false;
    return true;
  }), [rows, unitFilter, assigneeFilter, typeFilter, statusFilter]);

  const activeUnits = (units.data ?? []).filter(u => u.isActive !== false);
  const assigneesForUnit = (unitId?: string) => (people.data ?? []).filter(p => !unitId || p.unitId === Number(unitId) || p.unitId == null);
  const reassignTarget = reassignId != null ? rows.find(r => r.template.id === reassignId) : null;

  const submitAdd = () => {
    if (!addForm.title.trim()) return toast.error("اكتب اسم المهمة.");
    if (!addForm.unitId) return toast.error("اختر القسم.");
    if (addForm.frequency === "specific_days" && !specificDays.length) return toast.error("اختر يوماً واحداً على الأقل.");
    create.mutate({ unitId: Number(addForm.unitId), title: addForm.title.trim(), frequency: addForm.frequency, intervalDays: addForm.frequency === "custom" ? addForm.intervalDays : null, specificDays: addForm.frequency === "specific_days" ? specificDays : null, dueHourLocal: Number(addForm.dueHourLocal), workdayOnly: addForm.workdayOnly, defaultAssigneeProfileId: addForm.assigneeProfileId ? Number(addForm.assigneeProfileId) : undefined });
  };
  return <DashboardLayout><section dir="rtl" className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">إدارة المهام المتكررة</p>
        <h1 className="mt-2 text-3xl font-bold text-[#12352f]">المهام المخطَّطة</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-[#65766d]">قوالب المهام المتكررة المُسنَدة لموظفين، مع إمكانية الإضافة والإيقاف وإعادة الإسناد.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => setAddOpen(true)} className="min-h-[44px] bg-[#12352f] hover:bg-[#1d5245]"><Plus className="ml-1 h-4 w-4" />إضافة قالب</Button>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f0ea] text-[#1f5a47]"><CalendarClock className="h-6 w-6" /></div>
      </div>
    </header>

    <div className="mt-6 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-bold text-[#53675d]">القسم
        <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)} className="h-10 min-w-40 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm font-normal"><option value="">كل الأقسام</option>{activeUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-[#53675d]">المُسند
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="h-10 min-w-40 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm font-normal"><option value="">كل الموظفين</option>{(people.data ?? []).filter(p => !unitFilter || p.unitId === Number(unitFilter)).map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-[#53675d]">النوع
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-10 min-w-36 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm font-normal"><option value="">كل الأنواع</option>{FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-[#53675d]">الحالة
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-10 min-w-32 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm font-normal"><option value="">الكل</option><option value="active">نشط</option><option value="inactive">متوقف</option></select>
      </label>
    </div>

    <div className="mt-5 overflow-x-auto rounded-2xl border border-[#e7e0d4] bg-white">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-[#f7fbf7] text-right text-xs font-bold text-[#53675d]">
          <tr><th className="px-3 py-3">#</th><th className="px-3 py-3">المهمة</th><th className="px-3 py-3">النوع</th><th className="px-3 py-3">التكرار</th><th className="px-3 py-3">المُسند</th><th className="px-3 py-3">الحالة</th><th className="px-3 py-3">إجراء</th></tr>
        </thead>
        <tbody className="divide-y divide-[#eee8de]">
          {templates.isLoading ? <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[#738179]">جارٍ التحميل…</td></tr>
            : filtered.length ? filtered.map((row, idx) => (
              <tr key={row.template.id} className="hover:bg-[#fafdf9]">
                <td className="px-3 py-2.5 text-[#9aa89f]">{idx + 1}</td>
                <td className="px-3 py-2.5 font-bold text-[#26473a]">{row.template.title}</td>
                <td className="px-3 py-2.5 text-[#53675d]">{frequencyLabel(row.template.frequency)}</td>
                <td className="px-3 py-2.5 text-[#53675d]">{recurrenceLabel(row.template)}</td>
                <td className="px-3 py-2.5 text-[#53675d]">{row.template.defaultAssigneeProfileId ? peopleById.get(row.template.defaultAssigneeProfileId)?.fullName ?? `#${row.template.defaultAssigneeProfileId}` : "—"}</td>
                <td className="px-3 py-2.5"><button type="button" onClick={() => toggleActive.mutate({ templateId: row.template.id, isActive: !row.template.isActive })} className={`rounded-full px-3 py-1 text-xs font-bold ${row.template.isActive ? "bg-[#e7f3e9] text-[#2f7653]" : "bg-[#f1f1ef] text-[#8a9189]"}`}>{row.template.isActive ? "نشط" : "متوقف"}</button></td>
                <td className="px-3 py-2.5"><Button type="button" size="sm" variant="outline" className="border-[#c9d6c0] text-[#2d6b4f]" onClick={() => { setReassignId(row.template.id); setReassignProfileId(row.template.defaultAssigneeProfileId ? String(row.template.defaultAssigneeProfileId) : ""); }}><UserRoundCog className="ml-1 h-3.5 w-3.5" />إعادة إسناد</Button></td>
              </tr>
            )) : <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[#738179]">لا توجد مهام مخطَّطة ضمن نطاقك.</td></tr>}
        </tbody>
      </table>
    </div>
    <Dialog open={addOpen} onOpenChange={open => { if (!open) setAddOpen(false); }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>إضافة مهمة مخطَّطة</DialogTitle><DialogDescription>حدّد المهمة والموظف والنوع وأيام التكرار، وسيولّد النظام نسخة من المهمة تلقائياً وفق التكرار.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-bold text-[#6a786f]">المهمة<input value={addForm.title} onChange={e => setAddForm({ ...addForm, title: e.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" placeholder="مثال: تقرير شهري" /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-[#6a786f]">القسم<select value={addForm.unitId} onChange={e => { setAddForm({ ...addForm, unitId: e.target.value, assigneeProfileId: "" }); }} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">اختر القسم</option>{activeUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label className="block text-xs font-bold text-[#6a786f]">الموظف (اختياري)<select value={addForm.assigneeProfileId} onChange={e => setAddForm({ ...addForm, assigneeProfileId: e.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">غير مسند</option>{assigneesForUnit(addForm.unitId).map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label>
          </div>
          <label className="block text-xs font-bold text-[#6a786f]">النوع<select value={addForm.frequency} onChange={e => setAddForm({ ...addForm, frequency: e.target.value as Frequency })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm">{FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
          {addForm.frequency === "custom" && <label className="block text-xs font-bold text-[#6a786f]">كل كم يوم؟ (1-365)<input type="number" min={1} max={365} value={addForm.intervalDays} onChange={e => setAddForm({ ...addForm, intervalDays: Number(e.target.value) })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" /></label>}
          {addForm.frequency === "specific_days" && <div><label className="text-xs font-bold text-[#6a786f]">أيام التكرار</label><div className="mt-1 flex flex-wrap gap-2">{DAY_NAMES.map((name, day) => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={specificDays.includes(day)} onChange={e => { if (e.target.checked) setSpecificDays([...specificDays, day]); else setSpecificDays(specificDays.filter(d => d !== day)); }} className="h-4 w-4 accent-[#2d6b4f]" />{name}</label>)}</div></div>}
          <label className="block text-xs font-bold text-[#6a786f]">ساعة الاستحقاق<select value={addForm.dueHourLocal} onChange={e => setAddForm({ ...addForm, dueHourLocal: e.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm">{Array.from({ length: 24 }, (_, h) => <option key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</option>)}</select></label>
          <label className="flex items-center gap-2 text-xs font-bold text-[#6a786f]"><input type="checkbox" checked={addForm.workdayOnly} onChange={e => setAddForm({ ...addForm, workdayOnly: e.target.checked })} className="h-4 w-4 accent-[#2d6b4f]" />أيام العمل فقط (الأحد–الخميس)</label>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
          <Button type="button" disabled={create.isPending} onClick={submitAdd} className="bg-[#2f7653] hover:bg-[#245d41]">{create.isPending ? "جارٍ الحفظ…" : "حفظ القالب"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={reassignId != null} onOpenChange={open => { if (!open) setReassignId(null); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>إعادة إسناد المهمة المخطَّطة</DialogTitle><DialogDescription>غيّر الموظف الافتراضي لهذا القالب.</DialogDescription></DialogHeader>
        {reassignTarget && <p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">{reassignTarget.template.title}</p>}
        <label className="mt-3 block text-xs font-bold text-[#6a786f]">الموظف<select value={reassignProfileId} onChange={e => setReassignProfileId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"><option value="">غير مسند</option>{assigneesForUnit(reassignTarget ? String(reassignTarget.template.unitId ?? "") : "").map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setReassignId(null)}>إلغاء</Button>
          <Button type="button" disabled={setAssignee.isPending} onClick={() => reassignId != null && setAssignee.mutate({ templateId: reassignId, assigneeProfileId: reassignProfileId ? Number(reassignProfileId) : null })} className="bg-[#2f7653] hover:bg-[#245d41]">{setAssignee.isPending ? "جارٍ الحفظ…" : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section></DashboardLayout>;
}
