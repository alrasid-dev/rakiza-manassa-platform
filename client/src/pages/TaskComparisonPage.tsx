import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { jsPDF } from "jspdf";
import { BarChart3, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "");

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TaskComparisonPage() {
  const titles = trpc.court.reports.listTaskTitles.useQuery();
  const [title, setTitle] = useState("");
  const [sortBy, setSortBy] = useState<"completed" | "totalPoints" | "avgCompletionMinutes" | "complianceRate">("totalPoints");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const comparison = trpc.court.reports.compareTaskPerformance.useQuery(
    { title: title || undefined, fromDate: fromDate ? new Date(fromDate) : undefined, toDate: toDate ? new Date(toDate + "T23:59:59") : undefined, sortBy },
    { enabled: Boolean(title) },
  );
  const rows = comparison.data ?? [];

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFont("helvetica", "bold");
    doc.text("تقرير مقارنة المهام", 14, 16);
    doc.text(`نوع المهمة: ${title}`, 14, 24);
    const body = rows.map((r, i) => [String(i + 1), r.name, String(r.totalTasks), String(r.completed), String(r.onTime), String(r.late), r.avgCompletionMinutes == null ? "—" : `${r.avgCompletionMinutes} د`, String(r.totalPoints), `${r.complianceRate}%`]);
    (doc as any).autoTable({ head: [["الترتيب", "الاسم", "الإجمالي", "منجزة", "في الوقت", "متأخرة", "متوسط الزمن", "النقاط", "الالتزام %"]], body, startY: 30, theme: "grid" });
    doc.save("task-comparison.pdf");
  };

  const exportCsv = () => {
    downloadCsv("task-comparison.csv", [
      ["rank", "name", "total", "completed", "onTime", "late", "avgTime", "points", "compliance"],
      ...rows.map((r, i) => [String(i + 1), r.name, String(r.totalTasks), String(r.completed), String(r.onTime), String(r.late), r.avgCompletionMinutes == null ? "" : String(r.avgCompletionMinutes), String(r.totalPoints), String(r.complianceRate)]),
    ]);
  };

  const maxPoints = Math.max(1, ...rows.map(r => Math.abs(r.totalPoints)));

  return <DashboardLayout hideUtilityPrompts>
    <section className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6" dir="rtl">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">تقارير الأداء</p><h1 className="mt-2 text-3xl font-bold text-[#12352f]">تقارير مقارنة المهام</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-[#65766d]">قارن أداء الموظفين على مهمة معيّنة (الإنجاز، النقاط، الالتزام، السرعة).</p></div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f0ea] text-[#1f5a47]"><BarChart3 className="h-6 w-6" /></div>
      </header>

      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e7e0d4] bg-white p-4">
        <label className="flex flex-col gap-1 text-xs font-bold text-[#53675d]">نوع المهمة
          <select value={title} onChange={e => setTitle(e.target.value)} className="h-10 min-w-56 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm">
            <option value="">اختر مهمة…</option>
            {(titles.data ?? []).map(t => <option key={t.id} value={t.title}>{t.title}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-[#53675d]">من<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-10 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs font-bold text-[#53675d]">إلى<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-10 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs font-bold text-[#53675d]">معيار الترتيب
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="h-10 min-w-44 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm">
            <option value="totalPoints">الأعلى نقاط</option><option value="completed">الأكثر إنجازاً</option><option value="avgCompletionMinutes">الأسرع</option><option value="complianceRate">الأعلى التزاماً</option>
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportPdf} disabled={!rows.length} className="inline-flex items-center gap-1.5 rounded-lg border border-[#c6d4c7] px-3 py-2 text-xs font-bold text-[#355d4b] disabled:opacity-40"><FileText className="h-4 w-4" />PDF</button>
          <button type="button" onClick={exportCsv} disabled={!rows.length} className="inline-flex items-center gap-1.5 rounded-lg border border-[#c6d4c7] px-3 py-2 text-xs font-bold text-[#355d4b] disabled:opacity-40"><FileSpreadsheet className="h-4 w-4" />CSV</button>
        </div>
      </div>

      {comparison.isLoading ? <p className="mt-5 py-10 text-center text-sm text-[#6e7e75]">جارٍ التحميل…</p>
        : !title ? <p className="mt-5 py-10 text-center text-sm text-[#738179]">اختر نوع مهمة لعرض المقارنة.</p>
        : rows.length === 0 ? <p className="mt-5 py-10 text-center text-sm text-[#738179]">لا توجد بيانات للمعايير المختارة.</p>
        : <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="overflow-x-auto rounded-2xl border border-[#e7e0d4] bg-white p-4 lg:col-span-2">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-[#eee8de] text-[#6b5b45]">
                <th className="px-3 py-2 text-right font-medium">الترتيب</th><th className="px-3 py-2 font-medium">الموظف</th><th className="px-3 py-2 font-medium">الإجمالي</th><th className="px-3 py-2 font-medium">منجزة</th><th className="px-3 py-2 font-medium">في الوقت</th><th className="px-3 py-2 font-medium">متأخرة</th><th className="px-3 py-2 font-medium">متوسط الزمن</th><th className="px-3 py-2 font-medium">النقاط</th><th className="px-3 py-2 font-medium">الالتزام</th>
              </tr></thead>
              <tbody>{rows.map((r, i) => <tr key={r.profileId} className="border-b border-[#f3ecdf]">
                <td className="px-3 py-2 text-[#4a3b28]">{medal(i + 1)} {i + 1}</td>
                <td className="px-3 py-2 text-[#4a3b28]">{r.name}</td>
                <td className="px-3 py-2">{r.totalTasks}</td>
                <td className="px-3 py-2 text-emerald-700">{r.completed}</td>
                <td className="px-3 py-2">{r.onTime}</td>
                <td className="px-3 py-2 text-red-700">{r.late}</td>
                <td className="px-3 py-2">{r.avgCompletionMinutes == null ? "—" : `${r.avgCompletionMinutes} د`}</td>
                <td className={`px-3 py-2 font-bold ${r.totalPoints >= 0 ? "text-emerald-700" : "text-red-700"}`}>{r.totalPoints}</td>
                <td className="px-3 py-2">{r.complianceRate}%</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="rounded-2xl border border-[#e7e0d4] bg-white p-4">
            <p className="mb-3 text-sm font-bold text-[#12352f]">النقاط (مقارنة)</p>
            {rows.map((r, i) => <div key={r.profileId} className="mb-2">
              <div className="flex items-center justify-between text-xs"><span>{medal(i + 1)} {r.name}</span><span className="font-bold">{r.totalPoints}</span></div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-[#f1efe9]">
                <div className={`h-full rounded-full ${r.totalPoints >= 0 ? "bg-[#2f7653]" : "bg-[#c22b2b]"}`} style={{ width: `${Math.min(100, Math.abs(r.totalPoints) / maxPoints * 100)}%` }} />
              </div>
            </div>)}
          </div>
        </div>}
    </section>
  </DashboardLayout>;
}
