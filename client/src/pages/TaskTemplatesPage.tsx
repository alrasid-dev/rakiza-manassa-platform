import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { ListChecks, Plus, Repeat } from "lucide-react";
import { FormEvent, useState } from "react";
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

export default function TaskTemplatesPage() {
  const utils = trpc.useUtils();
  const templates = trpc.court.templates.list.useQuery();
  const units = trpc.court.units.list.useQuery();

  const [form, setForm] = useState({ unitId: "", title: "", frequency: "daily" as Frequency, intervalDays: 1, dueHourLocal: "13", workdayOnly: true });
  const [specificDays, setSpecificDays] = useState<number[]>([]);

  const create = trpc.court.templates.create.useMutation({
    onSuccess: () => { utils.court.templates.list.invalidate(); setForm({ unitId: "", title: "", frequency: "daily", intervalDays: 1, dueHourLocal: "13", workdayOnly: true }); toast.success("تم إنشاء القالب."); },
    onError: error => toast.error(error.message || "تعذر إنشاء القالب."),
  });
  const updateFrequency = trpc.court.templates.updateFrequency.useMutation({
    onSuccess: () => { utils.court.templates.list.invalidate(); toast.success("تم تحديث التكرار."); },
    onError: error => toast.error(error.message || "تعذر تحديث التكرار."),
  });
  const toggleActive = trpc.court.templates.toggleActive.useMutation({
    onSuccess: () => { utils.court.templates.list.invalidate(); },
    onError: error => toast.error(error.message || "تعذر تحديث الحالة."),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.unitId) { toast.error("أكمل القسم والعنوان."); return; }
    create.mutate({ unitId: Number(form.unitId), title: form.title.trim(), frequency: form.frequency, intervalDays: form.frequency === "custom" ? form.intervalDays : null, specificDays: form.frequency === "specific_days" ? specificDays : null, dueHourLocal: Number(form.dueHourLocal), workdayOnly: form.workdayOnly });
  };

  const activeUnits = (units.data ?? []).filter(unit => unit.isActive !== false);

  return <DashboardLayout><section dir="rtl" className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">إدارة المهام المتكررة</p>
        <h1 className="mt-2 text-3xl font-bold text-[#12352f]">قوالب المهام</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-[#65766d]">حدّد تكرار كل قالب (يومي/أسبوعي/شهري/ربع سنوي) وساعة الاستحقاق، وسيولّد النظام نسخة من المهمة تلقائياً في بداية يوم العمل وفق التكرار.</p>
      </div>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f0ea] text-[#1f5a47]"><Repeat className="h-6 w-6" /></div>
    </header>

    <form onSubmit={submit} className="mt-6 rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5">
      <h2 className="text-lg font-bold text-[#12352f]">قالب جديد</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold text-[#53675d]">القسم
          <select value={form.unitId} onChange={event => setForm({ ...form, unitId: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-[#ddd5c9] px-3 text-sm outline-none focus:border-[#57927b]">
            <option value="">اختر القسم</option>
            {activeUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-[#53675d]">عنوان القالب
          <input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="مثال: تدوين الإحاطة اليومية" className="mt-1 h-10 w-full rounded-xl border border-[#ddd5c9] px-3 text-sm outline-none focus:border-[#57927b]" />
        </label>
        <label className="text-xs font-bold text-[#53675d]">التكرار
          <select value={form.frequency} onChange={event => setForm({ ...form, frequency: event.target.value as Frequency })} className="mt-1 h-10 w-full rounded-xl border border-[#ddd5c9] px-3 text-sm outline-none focus:border-[#57927b]">
            {FREQUENCIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        {form.frequency === "custom" && <label className="text-xs font-bold text-[#53675d]">كل كم يوم؟ (1-365)
          <input type="number" min={1} max={365} value={form.intervalDays} onChange={event => setForm({ ...form, intervalDays: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-xl border border-[#ddd5c9] px-3 text-sm outline-none focus:border-[#57927b]" />
        </label>}
        {form.frequency === "specific_days" && <div className="md:col-span-2"><label className="text-xs font-bold text-[#53675d]">اختر الأيام</label><div className="mt-1 flex flex-wrap gap-2">{[{ day: 0, label: "الأحد" },{ day: 1, label: "الاثنين" },{ day: 2, label: "الثلاثاء" },{ day: 3, label: "الأربعاء" },{ day: 4, label: "الخميس" },{ day: 5, label: "الجمعة" },{ day: 6, label: "السبت" }].map(({ day, label }) => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={specificDays.includes(day)} onChange={event => { if (event.target.checked) { setSpecificDays([...specificDays, day]); } else { setSpecificDays(specificDays.filter(d => d !== day)); } }} className="h-4 w-4 accent-[#2d6b4f]" />{label}</label>)}</div>{specificDays.length === 0 && <p className="text-xs text-red-500 mt-1">⚠️ اختر يوم واحد على الأقل</p>}</div>}
        <label className="text-xs font-bold text-[#53675d]">ساعة الاستحقاق (محلياً)
          <select value={form.dueHourLocal} onChange={event => setForm({ ...form, dueHourLocal: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-[#ddd5c9] px-3 text-sm outline-none focus:border-[#57927b]">
            {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{`${String(hour).padStart(2, "0")}:00`}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm font-bold text-[#53675d]">
        <input type="checkbox" checked={form.workdayOnly} onChange={event => setForm({ ...form, workdayOnly: event.target.checked })} className="h-4 w-4 accent-[#2d6b4f]" />
        أيام العمل فقط (الأحد–الخميس)
      </label>
      <button type="submit" disabled={create.isPending} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#174b3c] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
        <Plus className="h-4 w-4" />{create.isPending ? "جارٍ الحفظ…" : "حفظ القالب"}
      </button>
    </form>

    <div className="mt-6 rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5">
      <div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-[#2d6b4f]" /><h2 className="text-lg font-bold text-[#12352f]">القوالب الحالية ({templates.data?.length ?? 0})</h2></div>
      {templates.isLoading ? <p className="mt-4 text-sm text-[#65766d]">جارٍ التحميل…</p> : !(templates.data?.length) ? <p className="mt-4 text-sm text-[#65766d]">لا توجد قوالب ضمن نطاق صلاحيتك بعد.</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead><tr className="border-b border-[#eee7da] text-xs text-[#8a9189]"><th className="py-2 font-bold">العنوان</th><th className="py-2 font-bold">القسم</th><th className="py-2 font-bold">التكرار</th><th className="py-2 font-bold">الفترة</th><th className="py-2 font-bold">الساعة</th><th className="py-2 font-bold">الحالة</th></tr></thead>
            <tbody>
              {(templates.data ?? []).map(row => (
                <tr key={row.template.id} className="border-b border-[#f3eee3] align-middle">
                  <td className="max-w-xs py-3 pr-2 font-bold text-[#29463b]">{row.template.title}</td>
                  <td className="py-3 px-2 text-[#65766d]">{row.unitName ?? "—"}</td>
                  <td className="py-3 px-2">
                    <select value={row.template.frequency} disabled={updateFrequency.isPending} onChange={event => updateFrequency.mutate({ templateId: row.template.id, frequency: event.target.value as Frequency, intervalDays: event.target.value === "custom" ? (row.template.intervalDays ?? 1) : null })} className="h-9 rounded-lg border border-[#ddd5c9] px-2 text-sm outline-none focus:border-[#57927b]">
                      {FREQUENCIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </td>
                  <td className="py-3 px-2 text-[#65766d]">
                    {row.template.frequency === "custom" ? <input type="number" min={1} max={365} value={row.template.intervalDays ?? 1} disabled={updateFrequency.isPending} onChange={event => updateFrequency.mutate({ templateId: row.template.id, frequency: row.template.frequency, intervalDays: Number(event.target.value) })} className="h-9 w-20 rounded-lg border border-[#ddd5c9] px-2 text-sm outline-none focus:border-[#57927b]" /> : "—"}
                  </td>
                  <td className="py-3 px-2 text-[#65766d]">{`${String(row.template.dueHourLocal).padStart(2, "0")}:00`}</td>
                  <td className="py-3 px-2">
                    <button type="button" onClick={() => toggleActive.mutate({ templateId: row.template.id, isActive: !row.template.isActive })} className={`rounded-full px-3 py-1 text-xs font-bold ${row.template.isActive ? "bg-[#e7f3e9] text-[#2f7653]" : "bg-[#f1f1ef] text-[#8a9189]"}`}>
                      {row.template.isActive ? "مفعّل" : "معطّل"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </section></DashboardLayout>;
}
