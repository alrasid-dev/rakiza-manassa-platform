import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Activity, AlertTriangle, Scale, Trophy, Users } from "lucide-react";
import React, { useState } from "react";

type PeriodKey = "daily" | "weekly" | "monthly" | "hijri";
const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "daily", label: "يومي" },
  { key: "weekly", label: "أسبوعي" },
  { key: "monthly", label: "شهري" },
  { key: "hijri", label: "هجري" },
];

function ComplianceDonut({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28" role="img" aria-label={`نسبة الالتزام ${pct}%`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="#006c35" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 50 50)" />
      <text x="50" y="55" textAnchor="middle" className="fill-[#12352f] text-xl font-black">{pct}%</text>
    </svg>
  );
}

export default function OwnerKpiPage() {
  const [period, setPeriod] = useState<PeriodKey>("monthly");
  const queryPeriod = period === "hijri" ? "monthly" : period;
  const kpis = (trpc.court as any).ownerKpis?.useQuery ? (trpc.court as any).ownerKpis.useQuery({ period: queryPeriod }) : { data: null, isLoading: false, error: null };
  const data = kpis.data;

  const ranking: any[] = data?.employeeRanking ?? [];
  const avgCompliance = ranking.length ? Math.round(ranking.reduce((sum: number, e: any) => sum + (e.complianceRate ?? 0), 0) / ranking.length) : 0;
  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="text-xs font-black tracking-[0.14em] text-[#b18448]">المالك ورئيس المحكمة فقط</p>
          <h1 className="mt-2 text-3xl font-black text-[#12352f]">مؤشرات القيادة</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#65766d]">نسبة إنجاز الأقسام، الضغط، المساءلات، متوسط وقت الإنجاز، ترتيب الموظفين، ونسبة الالتزام. مؤشرات إرشادية وليست أداة عقوبة.</p>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${period === p.key ? "bg-[#006c35] text-white" : "bg-[#eef3ef] text-[#12352f]"}`}>{p.label}</button>
          ))}
        </div>

        {kpis.isLoading ? (
          <p>جارٍ احتساب المؤشرات…</p>
        ) : kpis.error ? (
          <p className="text-[#a04a35]">{kpis.error.message}</p>
        ) : data ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <article className="rounded-2xl bg-[#e9f3ea] p-5"><p className="text-xs">متوسط إنجاز الأقسام</p><p className="mt-2 text-3xl font-black">{data.departmentCompletionRate}%</p></article>
              <article className="rounded-2xl bg-[#fff4ec] p-5"><p className="text-xs">أقسام بضغط مرتفع</p><p className="mt-2 text-3xl font-black">{data.highPressureDepartments.length}</p></article>
              <article className="rounded-2xl bg-[#fbeae5] p-5"><p className="text-xs">عدد المساءلات المفتوحة</p><p className="mt-2 text-3xl font-black">{data.accountabilityCount}</p></article>
              <article className="rounded-2xl bg-[#f4f2e8] p-5"><p className="text-xs">متوسط وقت الإنجاز بالساعات</p><p className="mt-2 text-3xl font-black">{data.averageCompletionHours ?? "—"}</p></article>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <section className="rounded-[1.5rem] border bg-white p-5">
                <div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#006c35]" /><h2 className="font-bold">نسبة الالتزام العامة</h2></div>
                <div className="mt-3 flex items-center gap-4"><ComplianceDonut value={avgCompliance} /><p className="text-sm leading-6 text-[#65766d]">متوسط أيام الحضور المؤكد خلال الفترة المحددة.</p></div>
              </section>

              <section className="rounded-[1.5rem] border bg-white p-5">
                <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-[#b18448]" /><h2 className="font-bold">أفضل 5 موظفين</h2></div>
                {(data.topPerformers ?? []).map((e: any, i: number) => (
                  <div key={e.profileId} className="mt-2 flex items-center justify-between rounded-lg bg-[#f2f8f3] px-3 py-2">
                    <span className="text-sm font-bold">{i + 1}. {e.fullName}</span>
                    <span className="text-sm font-black text-[#006c35]">{e.points} نقطة</span>
                  </div>
                ))}
              </section>

              <section className="rounded-[1.5rem] border bg-white p-5">
                <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-[#a04a35]" /><h2 className="font-bold">أدنى 5 موظفين</h2></div>
                {(data.lowPerformers ?? []).map((e: any) => (
                  <div key={e.profileId} className="mt-2 flex items-center justify-between rounded-lg bg-[#fbeeea] px-3 py-2">
                    <span className="text-sm font-bold">{e.fullName}</span>
                    <span className="text-sm font-black text-[#a04a35]">{e.points} نقطة</span>
                  </div>
                ))}
              </section>
            </div>

            <section className="mt-5 rounded-[1.5rem] border bg-white p-5">
              <h2 className="font-bold">ترتيب الموظفين</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-right text-sm">
                  <thead><tr className="border-b text-[#65766d]"><th className="py-2 px-2">الرتبة</th><th className="py-2 px-2">الاسم</th><th className="py-2 px-2">النقاط</th><th className="py-2 px-2">الالتزام</th></tr></thead>
                  <tbody>
                    {ranking.map((e: any, i: number) => (
                      <tr key={e.profileId} className="border-b last:border-0">
                        <td className="py-2 px-2 font-bold">{i + 1}</td>
                        <td className="py-2 px-2">{e.fullName}</td>
                        <td className="py-2 px-2 font-black">{e.points}</td>
                        <td className="py-2 px-2">{e.complianceRate ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-5 rounded-[1.5rem] border bg-white p-5">
              <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-[#006c35]" /><h2 className="font-bold">اقتراحات المداورة</h2></div>
              {data.rotationSuggestions?.length ? data.rotationSuggestions.map((item: any) => <p key={item.from} className="mt-3 text-sm leading-7">من <b>{item.from}</b> إلى <b>{item.to}</b> — {item.reason}</p>) : <p className="mt-3 text-sm text-[#718078]">لا توجد اقتراحات مداورة حالياً.</p>}
              <a href="/rotation" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#006c35]"><Scale className="h-4 w-4" />فتح نظام المداورة</a>
            </section>
          </>
        ) : null}
      </section>
    </DashboardLayout>
  );
}
