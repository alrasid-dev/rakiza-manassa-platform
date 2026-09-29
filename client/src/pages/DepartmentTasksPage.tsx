import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Archive, Plus, Pencil, XCircle } from "lucide-react";
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

  const [editTask, setEditTask] = useState<{ id: number; title: string; assigneeProfileId: number | null } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const updateTask = trpc.court.tasks.update.useMutation({
    onSuccess: () => { utils.court.department.tasks.invalidate({ unitId }); setEditTask(null); toast.success("تم تحديث المهمة."); },
    onError: error => toast.error(error.message || "تعذر التعديل."),
  });
  const [cancelTask, setCancelTask] = useState<{ id: number; title: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const cancel = trpc.court.tasks.cancel.useMutation({
    onSuccess: () => { utils.court.department.tasks.invalidate({ unitId }); setCancelTask(null); setCancelReason(""); toast.success("تم إلغاء المهمة."); },
    onError: error => toast.error(error.message || "تعذر الإلغاء."),
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
                      <div className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => { setEditTask(task); setEditTitle(task.title); setEditAssignee(task.assigneeProfileId ? String(task.assigneeProfileId) : ""); }} className="inline-flex items-center gap-1 rounded-lg border border-[#cbd5cf] px-2 py-1 text-xs font-bold text-[#355d4b] hover:bg-[#eef5ef]"><Pencil className="h-3.5 w-3.5" />تعديل</button>
                        <button type="button" onClick={() => { setCancelTask(task); setCancelReason(""); }} className="inline-flex items-center gap-1 rounded-lg border border-[#e7d6b8] px-2 py-1 text-xs font-bold text-[#8a6731] hover:bg-[#fff7ec]"><XCircle className="h-3.5 w-3.5" />إلغاء</button>
                        <button type="button" onClick={() => archive.mutate({ taskId: task.id })} disabled={archive.isPending} className="inline-flex items-center gap-1 rounded-lg border border-[#e7c5b8] px-2 py-1 text-xs font-bold text-[#a04a35] hover:bg-[#fff3ef]"><Archive className="h-3.5 w-3.5" />أرشفة</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editTask && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" dir="rtl">
          <h3 className="text-lg font-bold text-[#12352f]">تعديل المهمة</h3>
          <p className="mt-1 text-xs text-[#65766d]">{editTask.title}</p>
          <label className="mt-4 block text-xs font-bold text-[#6a786f]">العنوان
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#ddd5c9] px-3 text-sm" />
          </label>
          <label className="mt-3 block text-xs font-bold text-[#6a786f]">المكلَّفة
            <select value={editAssignee} onChange={e => setEditAssignee(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#ddd5c9] bg-white px-3 text-sm">
              <option value="">— بلا مكلَّفة —</option>
              {(people.data ?? []).map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setEditTask(null)} className="rounded-lg border border-[#cbd5cf] px-3 py-2 text-sm font-bold text-[#355d4b]">رجوع</button>
            <button type="button" onClick={() => updateTask.mutate({ taskId: editTask.id, title: editTitle, assigneeProfileId: editAssignee ? Number(editAssignee) : null })} disabled={updateTask.isPending || editTitle.trim().length < 3} className="rounded-lg bg-[#174b3c] px-3 py-2 text-sm font-bold text-white">{updateTask.isPending ? "جارٍ الحفظ…" : "حفظ"}</button>
          </div>
          {updateTask.error && <p className="mt-2 text-xs text-[#a04a35]">{updateTask.error.message}</p>}
        </div>
      </div>}

      {cancelTask && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" dir="rtl">
          <h3 className="text-lg font-bold text-[#12352f]">إلغاء المهمة</h3>
          <p className="mt-1 text-xs text-[#65766d]">{cancelTask.title}</p>
          <label className="mt-4 block text-xs font-bold text-[#6a786f]">سبب الإلغاء (مطلوب، 3 أحرف على الأقل)
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="mt-1 min-h-24 w-full rounded-md border border-[#ddd5c9] px-3 py-2 text-sm" />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setCancelTask(null)} className="rounded-lg border border-[#cbd5cf] px-3 py-2 text-sm font-bold text-[#355d4b]">رجوع</button>
            <button type="button" onClick={() => cancel.mutate({ taskId: cancelTask.id, cancellationReason: cancelReason })} disabled={cancel.isPending || cancelReason.trim().length < 3} className="rounded-lg bg-[#a04a35] px-3 py-2 text-sm font-bold text-white">{cancel.isPending ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}</button>
          </div>
          {cancel.error && <p className="mt-2 text-xs text-[#a04a35]">{cancel.error.message}</p>}
        </div>
      </div>}
    </section>
  </DashboardLayout>;
}
