import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";

const statusOptions = [
  { value: "", label: "كل الحالات" },
  { value: "new", label: "جديدة" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "under_review", label: "بانتظار المراجعة" },
  { value: "overdue", label: "متأخرة" },
  { value: "completed", label: "مكتملة" },
  { value: "cancelled", label: "ملغاة" },
  { value: "paused", label: "موقوفة" },
];

const sheets = [
  { name: "KPI", desc: "مؤشرات الأداء (المؤشر / القيمة / الوحدة)" },
  { name: "التدفق اليومي", desc: "التاريخ / مهام جديدة / مهام منجزة / حضور / إجازات" },
  { name: "المهام", desc: "تفاصيل المهام" },
  { name: "الحضور", desc: "سجلات الحضور والانصراف" },
  { name: "الإجازات", desc: "طلبات الإجازة والاستئذان" },
  { name: "الموظفون", desc: "بيانات الموظفين" },
  { name: "الأقسام", desc: "الأقسام التنظيمية" },
  { name: "الأرصدة", desc: "أرصدة الحضور الشهرية" },
  { name: "المساءلات", desc: "سجل المساءلات" },
  { name: "مهام الأقسام", desc: "مهام مجمعة بالأقسام" },
  { name: "المهام المتأخرة", desc: "المهام المتأخرة فقط" },
  { name: "ملخص الأقسام", desc: "ملخص إحصائي لكل قسم" },
];

export default function ExportKpiPage() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [unitId, setUnitId] = useState("");
  const [status, setStatus] = useState("");
  const [profileId, setProfileId] = useState("");

  const units = trpc.court.units.list.useQuery();
  const people = trpc.court.people.list.useQuery();

  const peopleInUnit = useMemo(() => {
    const list = people.data ?? [];
    return unitId ? list.filter(p => (p as { unitId?: number }).unitId === Number(unitId)) : list;
  }, [people.data, unitId]);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (unitId) qs.set("unitId", unitId);
      if (status) qs.set("status", status);
      if (profileId) qs.set("profileId", profileId);
      const res = await fetch(`/api/export/full?${qs.toString()}`, { method: "GET", credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 401) throw new Error("يجب تسجيل الدخول أولاً.");
        if (res.status === 403) throw new Error("هذه الصفحة متاحة للمالك ورئيس المحكمة فقط.");
        throw new Error(body?.error ?? "فشل توليد التقرير.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? "rakiza_full.xlsx";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    } finally {
      setDownloading(false);
    }
  };

  const inputCls = "mt-1 h-10 w-full rounded-md border border-[var(--rakiza-border)] bg-white px-3 text-sm";

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="text-xs font-black tracking-[0.14em] text-[var(--rakiza-gold)]">المالك ورئيس المحكمة فقط</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--rakiza-ink)]">تصدير التقرير الكامل</h1>
          <p className="mt-2 text-sm leading-7 text-[var(--rakiza-muted)]">
            ملف Excel واحد (12 ورقة) جاهز لفتحه في Power BI مباشرة بدون أي تعديل يدوي.
          </p>
        </header>

        <article className="rounded-[1.5rem] border bg-white p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--rakiza-olive-soft)] text-[var(--rakiza-olive-strong)]">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-black text-[var(--rakiza-ink)]">تقرير Excel موحّد (12 ورقة)</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--rakiza-muted)]">
                كل ورقة جدول نظيف بعمود رؤوس عربي ثم البيانات — جاهز للاستيراد في Power BI.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-bold text-[var(--rakiza-muted)]">من تاريخ
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
            </label>
            <label className="text-xs font-bold text-[var(--rakiza-muted)]">إلى تاريخ
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
            </label>
            <label className="text-xs font-bold text-[var(--rakiza-muted)]">القسم
              <select value={unitId} onChange={e => { setUnitId(e.target.value); setProfileId(""); }} className={inputCls}>
                <option value="">كل الأقسام</option>
                {(units.data ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-[var(--rakiza-muted)]">الحالة
              <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-[var(--rakiza-muted)]">الموظف
              <select value={profileId} onChange={e => setProfileId(e.target.value)} className={inputCls}>
                <option value="">كل الموظفين</option>
                {peopleInUnit.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--rakiza-olive-strong)] px-6 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "جارٍ توليد الملف…" : "تحميل التقرير الكامل"}
          </button>

          {error ? <p className="mt-3 text-sm font-bold text-[var(--rakiza-danger)]">{error}</p> : null}

          <div className="mt-6">
            <h3 className="text-sm font-black text-[var(--rakiza-ink)]">الأوراق المضمّنة (12 ورقة)</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sheets.map(s => (
                <div key={s.name} className="rounded-lg border border-[var(--rakiza-border)] bg-[var(--rakiza-surface)] px-3 py-2">
                  <p className="text-xs font-black text-[var(--rakiza-olive-strong)]">{s.name}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-[var(--rakiza-muted)]">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>
    </DashboardLayout>
  );
}
