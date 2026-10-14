import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const INK = "#243d32";
const MUTED = "#6f7e75";
const OLIVE = "#3f7354";
const GOLD = "#b18448";
const GOOD = "#006c35";
const BAD = "#a04a35";
const PIE_COLORS = [OLIVE, GOLD, BAD, "#2f6d6a", "#7a9b7f", "#8a5a44", MUTED];

function fmtPct(value: number) { return `${Math.round((value ?? 0) * 100)}%`; }

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-[#d6ded4] bg-white p-4 shadow-[0_6px_20px_rgba(36,61,50,0.05)]">
      <p className="text-xs font-bold text-[var(--rakiza-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-black" style={{ color: accent ?? INK }}>{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#d6ded4] bg-white p-4 shadow-[0_6px_20px_rgba(36,61,50,0.05)]">
      <h2 className="mb-3 text-sm font-black text-[var(--rakiza-ink)]">{title}</h2>
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [unitId, setUnitId] = useState("");

  const units = trpc.court.units.list.useQuery();
  const fromDate = useMemo(() => (from ? new Date(`${from}T00:00:00Z`) : null), [from]);
  const toDate = useMemo(() => (to ? new Date(`${to}T23:59:59Z`) : null), [to]);
  const unitParam = unitId ? Number(unitId) : undefined;

  const kpis = trpc.court.analytics.kpis.useQuery({ from: fromDate, to: toDate, unitId: unitParam }, { enabled: Boolean(fromDate && toDate) });
  const dailyFlow = trpc.court.analytics.dailyFlow.useQuery({ from: fromDate!, to: toDate!, unitId: unitParam }, { enabled: Boolean(fromDate && toDate) });
  const tasksByUnit = trpc.court.analytics.tasksByUnit.useQuery();
  const leavesByStatus = trpc.court.analytics.leavesByStatus.useQuery();

  const k = kpis.data;
  const flow = dailyFlow.data ?? [];
  const tasksFlow = flow.map(p => ({ date: p.date, "مهام": p.tasksCreated, "مكتملة": p.tasksCompleted }));
  const attendanceFlow = flow.map(p => ({ date: p.date, "حضور": p.present, "تأخر": p.late, "غياب": p.absent }));
  const leaves = (leavesByStatus.data ?? []).map(l => ({ name: l.status, value: l.count }));
  const unitsChart = (tasksByUnit.data ?? []).map(u => ({ name: u.unitName, "مهام": u.taskCount }));

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-7xl p-6">
        <header className="mb-6">
          <p className="text-xs font-black tracking-[0.14em] text-[var(--rakiza-gold)]">رئاسة المحكمة</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--rakiza-ink)]">التحليلات المتكاملة</h1>
          <p className="mt-1 text-sm text-[var(--rakiza-muted)]">نظرة شاملة على الأداء والحضور والإجازات والمساءلات.</p>
        </header>

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--rakiza-border)] bg-white p-4">
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--rakiza-muted)]">من
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-10 rounded-lg border border-[var(--rakiza-border)] bg-white px-3 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--rakiza-muted)]">إلى
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-10 rounded-lg border border-[var(--rakiza-border)] bg-white px-3 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--rakiza-muted)]">القسم
            <select value={unitId} onChange={e => setUnitId(e.target.value)} className="h-10 min-w-44 rounded-lg border border-[var(--rakiza-border)] bg-white px-3 text-sm">
              <option value="">كل الأقسام</option>
              {(units.data ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="الأقسام الفعّالة" value={String(k?.activeUnits ?? 0)} accent={OLIVE} />
          <KpiCard label="الموظفون النشطون" value={String(k?.activeEmployees ?? 0)} accent={OLIVE} />
          <KpiCard label="إجمالي المهام" value={String(k?.totalTasks ?? 0)} />
          <KpiCard label="المكتملة" value={String(k?.completedTasks ?? 0)} accent={GOOD} />
          <KpiCard label="المتأخرة" value={String(k?.overdueTasks ?? 0)} accent={BAD} />
          <KpiCard label="مستوى الإنجاز" value={fmtPct(k?.completionRate ?? 0)} accent={GOOD} />
          <KpiCard label="نسبة الالتزام" value={fmtPct(k?.attendanceRate ?? 0)} accent={GOOD} />
          <KpiCard label="الإجازات المعتمدة" value={String(k?.approvedLeaves ?? 0)} accent={GOLD} />
          <KpiCard label="المساءلات" value={String(k?.pendingDisciplinary ?? 0)} accent={BAD} />
          <KpiCard label="نسبة الأتمتة" value={fmtPct(k?.automationRate ?? 0)} accent={GOLD} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="المهام يومياً (آخر 30 يوم)">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tasksFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e2" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} />
                  <YAxis tick={{ fontSize: 10, fill: MUTED }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="مهام" fill={OLIVE} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="مكتملة" fill={GOLD} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="الحضور يومياً">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={attendanceFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e2" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} />
                  <YAxis tick={{ fontSize: 10, fill: MUTED }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="حضور" stroke={GOOD} strokeWidth={2} />
                  <Line type="monotone" dataKey="تأخر" stroke={GOLD} strokeWidth={2} />
                  <Line type="monotone" dataKey="غياب" stroke={BAD} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="الإجازات حسب الحالة">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={leaves} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {leaves.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="توزيع المهام على الأقسام (أعلى 10)">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={unitsChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e8e2" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: MUTED }} />
                  <Tooltip />
                  <Bar dataKey="مهام" fill={OLIVE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </section>
    </DashboardLayout>
  );
}

