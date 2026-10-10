import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { hijriMonthKey, hijriMonthRange, recentHijriMonths } from "@/lib/hijri-months";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
  excused: "مستأذن",
  on_leave: "إجازة",
};

const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function fmtDate(d: Date | string | number | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ar-SA");
}

function fmtTime(d: Date | string | number | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}

function combineDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  if ([y, m, d, h, min].some(n => Number.isNaN(n))) return null;
  return new Date(Date.UTC(y, m - 1, d, h, min, 0));
}

function timeOf(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

type Row = {
  attendance: {
    id: number;
    recordDate: Date;
    checkInAt?: Date | null;
    checkOutAt?: Date | null;
    status: string;
    positiveMinutes: number;
    negativeMinutes: number;
  };
  profileId: number;
  profileName: string;
};

type ModalState = {
  mode: "edit" | "create" | "delete";
  recordId?: number;
  recordDate: string;
  checkInAt: string;
  checkOutAt: string;
  status: string;
  reason: string;
};

export default function AttendanceMonthlyPage() {
  const permission = trpc.court.registration.myPermission.useQuery();
  const units = trpc.court.units.list.useQuery();
  const people = trpc.court.people.list.useQuery();
  const utils = trpc.useUtils();

  const [unitId, setUnitId] = useState("");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => hijriMonthKey(new Date()));
  const [modal, setModal] = useState<ModalState | null>(null);

  const isOwner = permission.data === "full_control";
  const activeUnitId = unitId ? Number(unitId) : undefined;
  const peopleInUnit = useMemo(
    () => (people.data ?? []).filter(p => !activeUnitId || p.unitId === activeUnitId),
    [people.data, activeUnitId],
  );

  const range = useMemo(() => hijriMonthRange(month) ?? { startAt: new Date(), endAt: new Date() }, [month]);

  const attendanceApi = trpc.court.attendance as any;
  const report = attendanceApi?.monthlyReport?.useQuery
    ? attendanceApi.monthlyReport.useQuery(profileId != null ? { profileId, startAt: range.startAt, endAt: range.endAt } : undefined, { enabled: profileId != null && isOwner })
    : { data: [] as Row[], isLoading: false };

  const invalidate = () => {
    if (profileId != null) {
      utils.court.attendance.monthlyReport?.invalidate?.({ profileId, startAt: range.startAt, endAt: range.endAt });
    }
  };

  const editCheckIn = attendanceApi?.ownerEditCheckIn?.useMutation({ onSuccess: () => { invalidate(); toast.success("تم تعديل وقت الدخول."); }, onError: (e: { message?: string }) => toast.error(e?.message || "تعذر التعديل") }) ?? { mutate: (_i: unknown) => undefined, isPending: false };
  const editCheckOut = attendanceApi?.ownerEditCheckOut?.useMutation({ onSuccess: () => { invalidate(); toast.success("تم تعديل وقت الانصراف."); }, onError: (e: { message?: string }) => toast.error(e?.message || "تعذر التعديل") }) ?? { mutate: (_i: unknown) => undefined, isPending: false };
  const createRecord = attendanceApi?.ownerCreateRecord?.useMutation({ onSuccess: () => { invalidate(); toast.success("تمت إضافة السجل."); }, onError: (e: { message?: string }) => toast.error(e?.message || "تعذرت الإضافة") }) ?? { mutate: (_i: unknown) => undefined, isPending: false };
  const deleteRecord = attendanceApi?.ownerDeleteRecord?.useMutation({ onSuccess: () => { invalidate(); toast.success("تم حذف السجل."); }, onError: (e: { message?: string }) => toast.error(e?.message || "تعذر الحذف") }) ?? { mutate: (_i: unknown) => undefined, isPending: false };

  const submitModal = () => {
    if (!modal || !profileId) return;
    if (modal.reason.trim().length < 10) { toast.error("السبب مطلوب (10 أحرف على الأقل)."); return; }
    const recordDate = new Date(modal.recordDate);
    if (modal.mode === "delete") { deleteRecord.mutate({ recordId: modal.recordId!, reason: modal.reason }); setModal(null); return; }
    if (modal.mode === "create") {
      createRecord.mutate({ profileId, recordDate, checkInAt: combineDateTime(modal.recordDate, modal.checkInAt) ?? undefined, checkOutAt: combineDateTime(modal.recordDate, modal.checkOutAt) ?? undefined, status: modal.status as "present" | "late" | "absent" | "excused" | "on_leave", reason: modal.reason });
      setModal(null); return;
    }
    const checkInAt = combineDateTime(modal.recordDate, modal.checkInAt);
    const checkOutAt = combineDateTime(modal.recordDate, modal.checkOutAt);
    if (checkInAt) editCheckIn.mutate({ profileId, recordDate, checkInAt, reason: modal.reason });
    if (checkOutAt) editCheckOut.mutate({ profileId, recordDate, checkOutAt, reason: modal.reason });
    setModal(null);
  };

  const rows = (report.data ?? []) as Row[];

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-6xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-[#b18448]">إدارة الحضور</p>
            <h1 className="mt-2 text-2xl font-bold text-[#12352f]">تعديل السجل الشهري (للمالك)</h1>
            <p className="mt-1 text-sm text-[#65766d]">اختر القسم والموظف والشهر لعرض وتعديل سجلات الحضور والانصراف.</p>
          </div>
        </div>

        {!isOwner ? (
          <p className="mt-6 rounded-xl border border-[#e7e0d4] bg-[#fbfaf6] px-4 py-6 text-center text-sm text-[#738179]">هذه الصفحة متاحة لمالك المنصة فقط.</p>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e7e0d4] bg-white p-4">
              <label className="flex flex-col gap-1 text-sm font-bold text-[#53675d] sm:text-xs">القسم
                <select value={unitId} onChange={e => { setUnitId(e.target.value); setProfileId(null); }} className="h-10 min-w-44 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm font-normal">
                  <option value="">كل الأقسام</option>
                  {(units.data ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold text-[#53675d] sm:text-xs">الموظف
                <select value={profileId?.toString() ?? ""} onChange={e => setProfileId(e.target.value ? Number(e.target.value) : null)} className="h-10 min-w-52 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm font-normal">
                  <option value="">اختر موظفاً…</option>
                  {peopleInUnit.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold text-[#53675d] sm:text-xs">الشهر
                <select value={month} onChange={e => setMonth(e.target.value)} className="h-10 min-w-40 rounded-lg border border-[#d9e3d8] bg-white px-3 text-sm font-normal">
                  {recentHijriMonths(14).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              {profileId != null && (
                <button type="button" onClick={() => setModal({ mode: "create", recordDate: range.startAt.toISOString().slice(0, 10), checkInAt: "", checkOutAt: "", status: "present", reason: "" })} className="h-10 rounded-lg bg-[#006c35] px-4 text-sm font-bold text-white hover:bg-[#00552b]">➕ إضافة سجل</button>
              )}
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-[#e7e0d4] bg-white">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[#f7fbf7] text-right text-sm font-bold text-[#53675d] sm:text-xs">
                  <tr>
                    <th className="px-3 py-3">التاريخ</th>
                    <th className="px-3 py-3">اليوم</th>
                    <th className="px-3 py-3">الدخول</th>
                    <th className="px-3 py-3">الخروج</th>
                    <th className="px-3 py-3">الحالة</th>
                    <th className="px-3 py-3">النقاط</th>
                    <th className="px-3 py-3">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee8de]">
                  {rows.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-[#738179]">{profileId == null ? "اختر موظفاً لعرض السجل." : "لا توجد سجلات في هذا الشهر."}</td></tr>
                  ) : rows.map(row => {
                    const a = row.attendance;
                    const dayName = dayNames[new Date(a.recordDate).getUTCDay()];
                    const points = (a.positiveMinutes ?? 0) - (a.negativeMinutes ?? 0);
                    return (
                      <tr key={a.id} className="hover:bg-[#fafdf9]">
                        <td className="px-3 py-2.5">{fmtDate(a.recordDate)}</td>
                        <td className="px-3 py-2.5 text-[#53675d]">{dayName}</td>
                        <td className="px-3 py-2.5">{fmtTime(a.checkInAt)}</td>
                        <td className="px-3 py-2.5">{fmtTime(a.checkOutAt)}</td>
                        <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-sm font-bold sm:text-xs ${a.status === "present" ? "bg-[#e4f0e4] text-[#2d684a]" : a.status === "absent" ? "bg-[#f8e6e1] text-[#a8493b]" : a.status === "late" ? "bg-[#f5edd8] text-[#80642b]" : "bg-[#e3eef5] text-[#2c5d77]"}`}>{statusLabels[a.status] ?? a.status}</span></td>
                        <td className="px-3 py-2.5 font-bold" dir="ltr">{points > 0 ? `+${points}` : points}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => setModal({ mode: "edit", recordId: a.id, recordDate: a.recordDate.toISOString().slice(0, 10), checkInAt: timeOf(a.checkInAt), checkOutAt: timeOf(a.checkOutAt), status: a.status, reason: "" })} className="rounded border border-[#b18448] px-2 py-1 text-xs font-bold text-[#805d27] hover:bg-[#f3e5bf]">✏️ تعديل</button>
                            <button type="button" onClick={() => setModal({ mode: "delete", recordId: a.id, recordDate: a.recordDate.toISOString().slice(0, 10), checkInAt: "", checkOutAt: "", status: a.status, reason: "" })} className="rounded border border-[#d8b1a4] px-2 py-1 text-xs font-bold text-[#a04a35] hover:bg-[#f8e1dc]">🗑️ حذف</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {modal && (
          <div role="dialog" aria-modal="true" aria-labelledby="owner-attendance-modal-title" className="fixed inset-0 z-[80] grid place-items-center bg-[#14251c]/40 p-4">
            <section dir="rtl" className="w-full max-w-lg rounded-[1.6rem] bg-[#f8f8f3] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#b18448] text-white">✏️</span>
                <div>
                  <p className="text-xs font-black text-[#8a6d20]">{modal.mode === "create" ? "إضافة سجل حضور" : modal.mode === "delete" ? "حذف سجل حضور" : "تعديل سجل حضور"}</p>
                  <h2 id="owner-attendance-modal-title" className="text-xl font-black text-[#183d2d]">{fmtDate(modal.recordDate)}</h2>
                </div>
              </div>

              {modal.mode === "create" && (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-bold text-[#53675d]">التاريخ<input type="date" value={modal.recordDate} onChange={e => setModal({ ...modal, recordDate: e.target.value })} className="mt-1 w-full rounded-md border border-[#e7e0d4] bg-white px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-[#53675d]">وقت الدخول<input type="time" value={modal.checkInAt} onChange={e => setModal({ ...modal, checkInAt: e.target.value })} className="mt-1 w-full rounded-md border border-[#e7e0d4] bg-white px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-[#53675d]">وقت الخروج<input type="time" value={modal.checkOutAt} onChange={e => setModal({ ...modal, checkOutAt: e.target.value })} className="mt-1 w-full rounded-md border border-[#e7e0d4] bg-white px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-[#53675d]">الحالة
                    <select value={modal.status} onChange={e => setModal({ ...modal, status: e.target.value })} className="mt-1 w-full rounded-md border border-[#e7e0d4] bg-white px-3 py-2 text-sm font-normal">
                      <option value="present">حاضر</option><option value="late">متأخر</option><option value="absent">غائب</option><option value="excused">مستأذن</option><option value="on_leave">إجازة</option>
                    </select>
                  </label>
                </div>
              )}

              {modal.mode === "edit" && (
                <div className="mt-4 space-y-3">
                  <p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[#355d4b]">التاريخ: {fmtDate(modal.recordDate)}</p>
                  <label className="block text-xs font-bold text-[#53675d]">وقت الدخول<input type="time" value={modal.checkInAt} onChange={e => setModal({ ...modal, checkInAt: e.target.value })} className="mt-1 w-full rounded-md border border-[#e7e0d4] bg-white px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-[#53675d]">وقت الخروج<input type="time" value={modal.checkOutAt} onChange={e => setModal({ ...modal, checkOutAt: e.target.value })} className="mt-1 w-full rounded-md border border-[#e7e0d4] bg-white px-3 py-2 text-sm font-normal" /></label>
                </div>
              )}

              {modal.mode === "delete" && <p className="mt-4 rounded-lg border border-[#e8b4a8] bg-[#fdf0ec] px-3 py-2 text-sm font-bold text-[#a04a35]">سيُحذف سجل هذا اليوم نهائياً مع تسجيل العملية في سجل التدقيق.</p>}

              <textarea value={modal.reason} onChange={e => setModal({ ...modal, reason: e.target.value })} placeholder="السبب (10 أحرف على الأقل)…" className="mt-4 w-full rounded-md border border-[#e7e0d4] bg-white px-3 py-2 text-sm" rows={3} />

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-[#e3c7b4] px-3 py-2 text-sm font-bold text-[#9a5c33]">إلغاء</button>
                <button type="button" disabled={modal.reason.trim().length < 10 || (modal.mode === "create" && !modal.recordDate) || editCheckIn.isPending || editCheckOut.isPending || createRecord.isPending || deleteRecord.isPending} onClick={submitModal} className="rounded-lg bg-[#2d6b4f] px-3 py-2 text-sm font-black text-white">{modal.mode === "delete" ? "حذف نهائي" : "حفظ"}</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}

