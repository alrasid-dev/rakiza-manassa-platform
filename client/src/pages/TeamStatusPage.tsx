import { useState } from "react";
import { toast } from "sonner";
import { UserCog, Clock, History } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

const statusLabels: Record<string, string> = {
  active: "حاضر / نشط",
  on_leave: "إجازة",
  inactive: "غير نشط",
  pending_review: "قيد المراجعة",
  archived: "مؤرشف",
};

export default function TeamStatusPage() {
  const utils = trpc.useUtils();
  const people = trpc.court.people.list.useQuery();
  const [target, setTarget] = useState<{ id: number; fullName: string; status: string } | null>(null);
  const [newStatus, setNewStatus] = useState<"active" | "on_leave" | "inactive" | "pending_review">("active");
  const [reason, setReason] = useState("");
  const [endDate, setEndDate] = useState("");
  const [historyProfileId, setHistoryProfileId] = useState<number | null>(null);
  const history = trpc.court.people.statusHistory.useQuery({ profileId: historyProfileId ?? 0 }, { enabled: Boolean(historyProfileId) });
  const setStatus = trpc.court.people.setStatusByManager.useMutation({
    onSuccess: () => { utils.court.people.list.invalidate(); utils.court.people.statusHistory.invalidate(); setTarget(null); setReason(""); setEndDate(""); toast.success("تم تحديث حالة الموظف وانعكس على مهامه وتقاريره فوراً."); },
    onError: error => toast.error(error.message || "تعذر تغيير الحالة."),
  });

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto w-full max-w-5xl space-y-6 p-6">
        <header>
          <p className="text-xs font-black tracking-[0.14em] text-[#b18448]">إدارة الفريق</p>
          <h1 className="mt-1 text-3xl font-black text-[#12352f]">حالة الموظفين</h1>
          <p className="mt-2 text-sm leading-7 text-[#60736a]">غيّر حالة أي موظف في قسمك (حاضر / إجازة / غير نشط) مع سبب إلزامي، وينعكس التغيير فوراً على مهامه وحضوره وتقاريره.</p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-[#e7e0d4] bg-white shadow-sm">
          <table className="w-full text-right text-sm">
            <thead className="bg-[#f7f5ef] text-xs font-bold text-[#12352f]">
              <tr>
                <th className="px-4 py-3">الاسم</th>
                <th className="px-4 py-3">القسم</th>
                <th className="px-4 py-3">الحالة الحالية</th>
                <th className="px-4 py-3">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee8de]">
              {(people.data ?? []).map(person => (
                <tr key={person.id}>
                  <td className="px-4 py-3 font-bold text-[#314d40]">{person.fullName}</td>
                  <td className="px-4 py-3 text-[#60736a]">{person.unitName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${person.status === "on_leave" ? "bg-[#fff3d6] text-[#8a6d20]" : person.status === "active" ? "bg-[#e7f3ea] text-[#2d6b4f]" : "bg-[#f0ece6] text-[#6e7e75]"}`}>{statusLabels[person.status] ?? person.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => { setTarget({ id: person.id, fullName: person.fullName, status: person.status }); setNewStatus(person.status === "on_leave" ? "active" : "on_leave"); setReason(""); setEndDate(""); }}><UserCog className="ml-1 h-4 w-4" />تغيير الحالة</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setHistoryProfileId(historyProfileId === person.id ? null : person.id)}><History className="ml-1 h-4 w-4" />السجل</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!people.data?.length && !people.isLoading && <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-[#738179]">لا يوجد موظفون ضمن نطاقك.</td></tr>}
            </tbody>
          </table>
        </div>

        {historyProfileId && (
          <div className="rounded-2xl border border-[#d9e7dc] bg-[#f7fbf7] p-4">
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-[#2f7653]" /><h2 className="text-sm font-bold text-[#12352f]">سجل تغييرات الحالة</h2></div>
            <div className="mt-3 space-y-2">
              {history.isLoading ? <p className="text-xs text-[#6e7e75]">جارٍ التحميل…</p> : history.data?.length ? history.data.map(item => <p key={item.id} className="text-xs leading-6 text-[#4c5f54]">{new Date(item.createdAt).toLocaleString("ar")} · {(item.metadata as Record<string, unknown>)?.from ?? "—"} ← {(item.metadata as Record<string, unknown>)?.to ?? "—"} · {(item.metadata as Record<string, unknown>)?.reason ?? ""}</p>) : <p className="text-xs text-[#6e7e75]">لا توجد تغييرات مسجلة.</p>}
            </div>
          </div>
        )}

        <Dialog open={Boolean(target)} onOpenChange={open => { if (!open) setTarget(null); }}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader>
              <DialogTitle>تغيير حالة الموظف</DialogTitle>
              <DialogDescription>{target?.fullName}</DialogDescription>
            </DialogHeader>
            <form onSubmit={event => { event.preventDefault(); if (target && reason.trim().length >= 10) setStatus.mutate({ profileId: target.id, newStatus, reason: reason.trim(), endDate: endDate ? new Date(endDate) : undefined }); }} className="space-y-3">
              <label className="block text-xs font-bold text-[#6a786f]">الحالة الجديدة
                <select value={newStatus} onChange={event => setNewStatus(event.target.value as typeof newStatus)} className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
                  <option value="active">حاضر / نشط</option>
                  <option value="on_leave">إجازة</option>
                  <option value="inactive">غير نشط</option>
                  <option value="pending_review">قيد المراجعة</option>
                </select>
              </label>
              {newStatus === "on_leave" && <label className="block text-xs font-bold text-[#6a786f]">نهاية الإجازة (اختياري)<Input value={endDate} onChange={event => setEndDate(event.target.value)} className="mt-1" type="datetime-local" /></label>}
              <label className="block text-xs font-bold text-[#6a786f]">سبب التغيير (10 أحرف على الأقل)<Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="وضح سبب تغيير الحالة…" className="mt-1 min-h-24" required minLength={10} /></label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTarget(null)}>إلغاء</Button>
                <Button type="submit" disabled={setStatus.isPending || reason.trim().length < 10} className="bg-[#12352f] hover:bg-[#1d5245]">{setStatus.isPending ? "جارٍ الحفظ…" : "حفظ التغيير"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </section>
    </DashboardLayout>
  );
}
