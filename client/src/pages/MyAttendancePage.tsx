import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

const statusLabels: Record<string, string> = {
  present: "حاضر", late: "متأخر", absent: "غائب", excused: "مستأذن", on_leave: "إجازة",
};

const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function fmtDate(d: Date | string | number | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" });
}

function fmtTime(d: Date | string | number | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
}

type Row = { attendance: { id: number; recordDate: Date; checkInAt?: Date | null; checkOutAt?: Date | null; status: string } };

export default function MyAttendancePage() {
  const attendance = trpc.court.attendance.list.useQuery();
  const rows = (attendance.data ?? []) as Row[];

  const last30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    return rows.filter(r => new Date(r.attendance.recordDate).getTime() >= cutoff);
  }, [rows]);

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-4xl p-6">
        <p className="text-xs font-bold tracking-[0.14em] text-[var(--rakiza-gold)]">حضوري</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--rakiza-ink)]">سجل حضوري وانصرافي</h1>
        <p className="mt-1 text-sm text-[var(--rakiza-muted)]">آخر 30 يوماً من سجل الحضور والانصراف (للقراءة فقط).</p>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--rakiza-border)] bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7fbf7] text-right text-sm font-bold text-[var(--rakiza-muted)]">
              <tr>
                <th className="px-3 py-3">التاريخ</th>
                <th className="px-3 py-3">اليوم</th>
                <th className="px-3 py-3">الدخول</th>
                <th className="px-3 py-3">الخروج</th>
                <th className="px-3 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee8de]">
              {last30.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-[var(--rakiza-muted)]">لا توجد سجلات في آخر 30 يوماً.</td></tr>
              ) : last30.map(row => {
                const a = row.attendance;
                const dayName = dayNames[new Date(a.recordDate.getTime() + 3 * 60 * 60 * 1000).getUTCDay()];
                return (
                  <tr key={a.id} className="hover:bg-[#fafdf9]">
                    <td className="px-3 py-2.5">{fmtDate(a.recordDate)}</td>
                    <td className="px-3 py-2.5 text-[var(--rakiza-muted)]">{dayName}</td>
                    <td className="px-3 py-2.5">{fmtTime(a.checkInAt)}</td>
                    <td className="px-3 py-2.5">{fmtTime(a.checkOutAt)}</td>
                    <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.status === "present" ? "bg-[#e4f0e4] text-[var(--rakiza-olive-strong)]" : a.status === "absent" ? "bg-[#f8e6e1] text-[var(--rakiza-danger)]" : a.status === "late" ? "bg-[#f5edd8] text-[var(--rakiza-gold)]" : "bg-[#e3eef5] text-[#2c5d77]"}`}>{statusLabels[a.status] ?? a.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardLayout>
  );
}