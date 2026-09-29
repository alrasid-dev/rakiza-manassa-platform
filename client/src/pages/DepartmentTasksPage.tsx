import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Archive, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  new: "جديدة", in_progress: "قيد التنفيذ", under_review: "بانتظار المراجعة", completed: "مكتملة", overdue: "متأخرة", cancelled: "ملغاة",
};

function recurrenceLabel(task: { recurrence?: string | null; recurrenceInterval?: number | null }) {
  if (!task.recurrence || task.recurrence === "none") return "—";
  if (task.recurrence === "custom") return `كل ${task.recurrenceInterval || 1} أيام`;
  const labels: Record<string, string> = { daily: "يومي", weekly: "أسبوعي", monthly: "شهري", quarterly: "ربع سنوي", yearly: "سنوي" };
  return labels[task.recurrence] ?? task.recurrence;
}

export default function DepartmentTasksPage() {
  const params = useParams();
  const unitId = Number(params.unitId);
  const valid = Number.isFinite(unitId) && unitId > 0;
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState("all");

  const units = trpc.court.units.list.useQuery();
  const unitName = units.data?.find(u => u.id === unitId)?.name ?? `القسم ${unitId}`;
  const tasks = trpc.court.department.tasks.useQuery({ unitId }, { enabled: valid });
  const people = trpc.court.people.list.useQuery({ unitId }, { enabled: valid });

  const archive = trpc.court.department.archive.useMutation({
    onSuccess: () => { utils.court.department.tasks.invalidate({ unitId }); toast.success("تمت أرشفة المهمة."); },
    onError: error => toast.error(error.message || "تعذر الأرشفة."),
  });

  const peopleById = useMemo(() => new Map((people.data ?? []).map(p => [p.id, p.fullName])), [people.data]);
  const list = tasks.data ?? [];
  const filtered = statusFilter === "all" ? list : list.filter(t => t.status === statusFilter);
  const activeCount = list.filter(t => ["new", "in_progress", "under_review"].includes(t.status)).length;
  const overdueCount = list.filter(t => t.status === "overdue" || (new Date(t.dueAt).getTime() < Date.now() && !["completed", "cancelled"].includes(t.status))).length;
  const completedCount = list.filter(t => t.status === "completed").length;

  const fmt = (d: Date | string | number) => new Date(d).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" });

  return <DashboardLayout>
    <section dir="rtl" className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">إدارة مهام القسم</p>
          <h1 className="mt-2 text-3xl font-bold text-[#12352f]">{unitName}</h1>
          <p className="mt-2 text-sm leading-7 text-[#65766d]">جدول مهام القسم مع التكرار والمواعيد والمكلفين، مع إجراءات الأرشفة والتصفية.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[#e7f3e9] px-3 py-1.5 text-xs font-bold text-[#2f7653]">{activeCount} نشطة</span>
          <span className="rounded-full bg-[#f8e6e1] px-3 py-1.5 text-xs font-bold text-[#a8493b]">{overdueCount} متأخرة</span>
          <span className="rounded-full bg-[#eaf4ff] px-3 py-1.5 text-xs font-bold text-[#26628d]">{completedCount} مكتملة</span>
        </div>
      </header>

      <div className="mt-6 rounded-[1.5rem] border border-[#e7e0d4] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#12352f]">جدول المهام ({filtered.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-lg border border-[#ddd5c9] bg-white px-2 text-sm">
              <option value="all">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <a href="/tasks" className="inline-flex items-center gap-1.5 rounded-xl bg-[#174b3c] px-3 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4" />إضافة مهمة</a>
          </div>
        </div>

        {tasks.isLoading ? <p className="mt-4 text-sm text-[#65766d]">جارٍ التحميل…</p> : !filtered.length ? <p className="mt-4 text-sm text-[#65766d]">لا توجد مهام ضمن هذا الفلتر.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-sm">
              <thead><tr className="border-b border-[#eee7da] text-xs text-[#8a9189]">
                <th className="py-2 font-bold">#</th>
                <th className="py-2 font-bold">العنوان</th>
                <th className="py-2 font-bold">التكرار</th>
                <th className="py-2 font-bold">البداية</th>
                <th className="py-2 font-bold">النهاية</th>
                <th className="py-2 font-bold">المكلف</th>
                <th className="py-2 font-bold">الحالة</th>
                <th className="py-2 font-bold">الإجراءات</th>
              </tr></thead>
              <tbody>
                {filtered.map((task, i) => (
                  <tr key={task.id} className="border-b border-[#f3eee3] align-middle">
                    <td className="py-3 text-[#8a9189]">{i + 1}</td>
                    <td className="max-w-xs py-3 pr-2 font-bold text-[#29463b]">{task.title}</td>
                    <td className="py-3 px-2 text-[#65766d]">{recurrenceLabel(task)}</td>
                    <td className="py-3 px-2 text-[#65766d]">{fmt(task.scheduledFor)}</td>
                    <td className="py-3 px-2 text-[#65766d]">{task.isOpen ? "مفتوحة" : fmt(task.dueAt)}</td>
                    <td className="py-3 px-2 text-[#65766d]">{task.assigneeProfileId ? peopleById.get(task.assigneeProfileId) ?? `#${task.assigneeProfileId}` : "—"}</td>
                    <td className="py-3 px-2"><span className="rounded-full bg-[#f1f1ef] px-2 py-1 text-xs font-bold text-[#5a625d]">{STATUS_LABELS[task.status] ?? task.status}</span></td>
                    <td className="py-3 px-2">
                      <button type="button" onClick={() => archive.mutate({ taskId: task.id })} disabled={archive.isPending} className="inline-flex items-center gap-1 rounded-lg border border-[#e7c5b8] px-2 py-1 text-xs font-bold text-[#a04a35] hover:bg-[#fff3ef]"><Archive className="h-3.5 w-3.5" />أرشفة</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  </DashboardLayout>;
}
