import { trpc } from "@/lib/trpc";
import { usePermissionsSnapshot } from "@/hooks/usePermissionsSnapshot";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowRightLeft, Search } from "lucide-react";
import { useMemo, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  new: "جديدة",
  in_progress: "قيد التنفيذ",
  under_review: "قيد المراجعة",
  completed: "مكتملة",
  overdue: "متأخرة",
  cancelled: "ملغاة",
  paused: "موقوفة",
};

function fmtDate(value: unknown) {
  if (!value) return "—";
  const d = new Date(value as string | number | Date);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(d);
}

export default function TasksReassignPage() {
  const utils = trpc.useUtils();
  const { permission: permissionSnapshot, roles: rolesSnapshot } = usePermissionsSnapshot();
  const units = trpc.court.units.list.useQuery();
  const people = trpc.court.people.list.useQuery({ personType: "administrative" });
  const [unitId, setUnitId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const canReassign = permissionSnapshot === "full_control" || rolesSnapshot.some((r) => ["department_manager", "court_president", "assistant_president", "court_secretary", "trainee_affairs_manager", "performance_monitor"].includes(r));

  const tasks = trpc.court.tasks.list.useQuery({ unitId: unitId ?? undefined }, { enabled: Boolean(canReassign) });

  const reassign = trpc.court.tasks.reassignTask.useMutation({
    onSuccess: (r) => { utils.court.tasks.list.invalidate(); setDialog(null); setReason(""); setNewAssigneeId(""); setDurationDays(""); toast.success(`تم نقل المهمة إلى ${r.newAssigneeName}.`); },
    onError: (error) => toast.error(error.message || "تعذر نقل المهمة."),
  });

  const [dialog, setDialog] = useState<{ taskId: number; title: string; oldAssigneeProfileId: number | null; unitId: number | null } | null>(null);
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [reason, setReason] = useState("");
  const [durationDays, setDurationDays] = useState("");

  const peopleById = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const unitById = useMemo(() => new Map((units.data ?? []).map((u) => [u.id, u])), [units.data]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const list = tasks.data ?? [];
    if (!q) return list;
    return list.filter((t) => (t.title ?? "").includes(q) || (peopleById.get(t.assigneeProfileId ?? 0)?.fullName ?? "").includes(q));
  }, [tasks.data, query, peopleById]);

  const candidates = useMemo(
    () => (people.data ?? []).filter((p) => p.status === "active" && (!dialog?.unitId || p.unitId === dialog.unitId) && p.id !== dialog?.oldAssigneeProfileId),
    [people.data, dialog],
  );

  const submitReassign = () => {
    if (!dialog) return;
    if (!newAssigneeId) { toast.error("اختر الموظف الجديد."); return; }
    if (reason.trim().length < 10) { toast.error("سبب النقل يجب أن يكون 10 أحرف على الأقل."); return; }
    reassign.mutate({ taskId: dialog.taskId, newAssigneeProfileId: Number(newAssigneeId), reason: reason.trim(), durationDays: durationDays ? Number(durationDays) : null });
  };

  return (
    <DashboardLayout>
      <section className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-[var(--rakiza-gold)]">تشغيل ومتابعة</p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--rakiza-ink)]">إعادة إسناد المهام</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--rakiza-muted)]">نقل المهام يدوياً بين الموظفين النشطين في القسم نفسه، مع سبب موثق وإشعار الطرفين.</p>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--rakiza-olive-soft)] text-[var(--rakiza-olive-strong)]"><ArrowRightLeft className="h-6 w-6" /></div>
        </header>

        {!canReassign ? (
          <div className="mt-8 rounded-2xl border border-[var(--rakiza-border)] bg-white p-8 text-center text-sm text-[var(--rakiza-muted)]">إعادة الإسناد اليدوي متاحة للمدير المباشر والقيادة فقط.</div>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--rakiza-border)] bg-white p-3">
              <select aria-label="اختر القسم" value={unitId?.toString() ?? ""} onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)} className="h-10 min-w-44 rounded-lg border border-[var(--rakiza-border)] bg-white px-3 text-sm">
                <option value="">كل الأقسام</option>
                {(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <div className="relative min-w-56 flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e9381]" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بعنوان المهمة أو اسم الموظف…" className="h-10 w-full rounded-lg border border-[var(--rakiza-border)] bg-white pr-9 pl-3 text-sm" />
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--rakiza-border)] bg-white shadow-[0_10px_30px_rgba(30,51,42,0.05)]">
              <div className="overflow-x-auto overflow-touch">
                <table className="w-full min-w-[720px] text-right text-sm">
                  <thead className="bg-[#f4f6f2] text-xs font-bold text-[var(--rakiza-muted)]">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">المهمة</th>
                      <th className="px-4 py-3">المُسندة إليها</th>
                      <th className="px-4 py-3">القسم</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">موعد البدء</th>
                      <th className="px-4 py-3">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee8de]">
                    {tasks.isLoading ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--rakiza-muted)]">جارٍ التحميل…</td></tr>
                    ) : filtered.length ? filtered.map((task, i) => (
                      <tr key={task.id} className="hover:bg-[#fafbf9]">
                        <td className="px-4 py-3 text-[var(--rakiza-muted)]">{i + 1}</td>
                        <td className="px-4 py-3 font-bold text-[var(--rakiza-ink)]">{task.title}</td>
                        <td className="px-4 py-3">{peopleById.get(task.assigneeProfileId ?? 0)?.fullName ?? "غير مسندة"}</td>
                        <td className="px-4 py-3 text-xs">{unitById.get(task.unitId ?? 0)?.name ?? "—"}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-[#eef3ee] px-2 py-0.5 text-[11px] font-bold text-[var(--rakiza-olive)]">{STATUS_LABELS[task.status] ?? task.status}</span></td>
                        <td className="px-4 py-3 text-xs text-[var(--rakiza-muted)]">{fmtDate(task.scheduledFor)}</td>
                        <td className="px-4 py-3">
                          <Button type="button" size="sm" variant="outline" disabled={task.status === "completed" || task.status === "cancelled"} onClick={() => setDialog({ taskId: task.id, title: task.title, oldAssigneeProfileId: task.assigneeProfileId ?? null, unitId: task.unitId ?? null })} className="border-[#cbb27a] text-[var(--rakiza-gold)] hover:bg-[#fff8ec]">
                            <ArrowRightLeft className="ml-1 h-4 w-4" />نقل
                          </Button>
                        </td>
                      </tr>
                    )) : <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--rakiza-muted)]">لا توجد مهام ضمن هذا النطاق.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => { if (!open) { setDialog(null); setReason(""); setNewAssigneeId(""); } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>إعادة إسناد المهمة</DialogTitle>
            <DialogDescription>انقل المهمة إلى موظف نشط من القسم نفسه مع سبب موثق.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[var(--rakiza-olive)]">{dialog?.title}</p>
            <label className="block text-xs font-bold text-[var(--rakiza-muted)]">
              من
              <div className="mt-1 h-10 rounded-md border border-input bg-[#f5f4ef] px-3 py-2 text-sm text-[#4c5f54]">
                {dialog?.oldAssigneeProfileId ? peopleById.get(dialog.oldAssigneeProfileId)?.fullName ?? `#${dialog.oldAssigneeProfileId}` : "غير مسندة"}
              </div>
            </label>
            <label className="block text-xs font-bold text-[var(--rakiza-muted)]">
              إلى (موظف نشط من نفس القسم)
              <select value={newAssigneeId} onChange={(e) => setNewAssigneeId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
                <option value="">اختر الموظف الجديد</option>
                {candidates.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب النقل (إلزامي، 10-500 حرف)…" className="min-h-24" />
            <label className="block text-xs font-bold text-[var(--rakiza-muted)]">
              مدة الإسناد المؤقت (اختياري، بالأيام)
              <input type="number" min={1} max={365} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="مثال: 7 — اتركه فارغاً لإسناد دائم" className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" />
              <span className="mt-1 block font-normal text-[#8a978f]">إن حددت مدة، تعود المهمة تلقائياً إلى الموظف الأصلي بعد انتهائها.</span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setDialog(null); setReason(""); setNewAssigneeId(""); setDurationDays(""); }}>إلغاء</Button>
            <Button type="button" disabled={reassign.isPending || !newAssigneeId || reason.trim().length < 10} onClick={submitReassign} className="bg-[var(--rakiza-olive-strong)] hover:bg-[#245d41]">
              {reassign.isPending ? "جارٍ النقل…" : "تأكيد النقل"}
            </Button>
          </DialogFooter>
          {reassign.error && <p className="text-xs text-[var(--rakiza-danger)]">{reassign.error.message}</p>}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
