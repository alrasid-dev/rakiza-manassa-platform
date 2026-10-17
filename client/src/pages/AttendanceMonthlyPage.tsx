import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { usePermissionsSnapshot } from "@/hooks/usePermissionsSnapshot";
import { hijriMonthKey, hijriMonthRange } from "@/lib/hijri-months";
import { riyadhDateKey, riyadhLocalToUtc, riyadhTimeKey, toRiyadh } from "@/lib/riyadh-time";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const statusLabels: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
  excused: "مستأذن",
  on_leave: "إجازة",
};

const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const confirmationStatusLabel = (c: { status: string } | null | undefined) => {
  if (!c) return "لم يُرسل";
  if (c.status === "done") return "مؤكد";
  return "غير مؤكد";
};

function cellRef(row: number, col: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let c = col;
  let ref = "";
  while (c >= 0) {
    ref = letters[c % 26] + ref;
    c = Math.floor(c / 26) - 1;
  }
  return `${ref}${row + 1}`;
}

function styleCell(ws: XLSX.WorkSheet, row: number, col: number, opts: { fill?: string; color?: string; bold?: boolean; align?: "left" | "center" | "right" }) {
  const target = (ws as Record<string, unknown>)[cellRef(row, col)] as { s?: Record<string, unknown> } | undefined;
  if (!target) return;
  target.s = {
    font: { name: "Calibri", sz: 11, bold: !!opts.bold, color: opts.color ? { rgb: opts.color } : { rgb: "243D32" } },
    ...(opts.fill ? { fill: { patternType: "solid", fgColor: { rgb: opts.fill } } } : {}),
    ...(opts.align ? { alignment: { horizontal: opts.align } } : {}),
  };
}

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

function combineDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  return riyadhLocalToUtc(`${dateStr}T${timeStr}`);
}

function timeOf(d: Date | string | number | null | undefined): string {
  return riyadhTimeKey(d);
}

function saudiDateKey(d: Date | string | number | null | undefined): string {
  return riyadhDateKey(d);
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
  attendanceMode?: string | null;
  unitId?: number;
  unitName?: string;
  confirmation?: { status: string; sentAt?: Date | null; confirmedAt?: Date | null } | null;
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
  // تجميد قرار الصلاحيات بعد أول تحميل ناجح — يمنع اختفاء/ظهور الأزرار بسبب حالة الجلب غير المستقرة
  const { permission: permissionSnapshot, roles: rolesSnapshot } = usePermissionsSnapshot();
  const units = trpc.court.units.list.useQuery();
  const people = trpc.court.people.list.useQuery();
  const utils = trpc.useUtils();

  const [unitId, setUnitId] = useState("");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "remote" | "present" | "late" | "no_record">("all");
  const [confirmationStatus, setConfirmationStatus] = useState<"all" | "confirmed" | "unconfirmed" | "not_sent">("all");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const r = hijriMonthRange(hijriMonthKey(new Date()));
    return r ? riyadhDateKey(r.startAt) : riyadhDateKey(new Date());
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const r = hijriMonthRange(hijriMonthKey(new Date()));
    return r ? riyadhDateKey(new Date(r.endAt.getTime() - 86400000)) : riyadhDateKey(new Date());
  });
  const [modal, setModal] = useState<ModalState | null>(null);

  const isOwner = permissionSnapshot === "full_control";
  const canView = isOwner || rolesSnapshot.some(role => ["court_president", "assistant_president", "court_secretary", "human_resources_manager", "department_manager", "trainee_affairs_manager", "performance_monitor"].includes(role));
  const canEdit = isOwner || rolesSnapshot.includes("court_secretary");
  const activeUnitId = unitId ? Number(unitId) : undefined;
  const peopleInUnit = useMemo(
    () => (people.data ?? []).filter(p => !activeUnitId || p.unitId === activeUnitId),
    [people.data, activeUnitId],
  );

  const range = useMemo(() => {
    const startAt = dateFrom ? riyadhLocalToUtc(`${dateFrom}T00:00`) : undefined;
    let endAt: Date | undefined;
    if (dateTo) {
      const d = riyadhLocalToUtc(`${dateTo}T00:00`);
      endAt = new Date(d.getTime() + 86400000);
    }
    return { startAt, endAt };
  }, [dateFrom, dateTo]);

  const attendanceApi = trpc.court.attendance as any;
  const hasSelection = showAll || profileId != null;
  const report = attendanceApi?.report?.useQuery
    ? attendanceApi.report.useQuery(
        hasSelection && range.startAt && range.endAt
          ? { unitId: unitId ? Number(unitId) : null, profileId: showAll ? null : profileId, startAt: range.startAt, endAt: range.endAt, confirmationStatus }
          : undefined,
        { enabled: hasSelection && Boolean(range.startAt && range.endAt) && canView },
      )
    : { data: [] as Row[], isLoading: false };

  const invalidate = () => {
    (utils.court.attendance as any).report?.invalidate?.();
    // خط ثانٍ: refetch مباشر لضمان التحديث الفوري.
    (report as { refetch?: () => void } | undefined)?.refetch?.();
  };

  const updateRecord = attendanceApi?.ownerUpdateAttendance?.useMutation({ onSuccess: () => { invalidate(); toast.success("تم حفظ التعديل."); }, onError: (e: { message?: string }) => toast.error(e?.message || "تعذر الحفظ") }) ?? { mutate: (_i: unknown) => undefined, isPending: false };
  const createRecord = attendanceApi?.ownerCreateRecord?.useMutation({ onSuccess: () => { invalidate(); toast.success("تمت إضافة السجل."); }, onError: (e: { message?: string }) => toast.error(e?.message || "تعذرت الإضافة") }) ?? { mutate: (_i: unknown) => undefined, isPending: false };
  const deleteRecord = attendanceApi?.ownerDeleteRecord?.useMutation({ onSuccess: () => { invalidate(); toast.success("تم حذف السجل."); }, onError: (e: { message?: string }) => toast.error(e?.message || "تعذر الحذف") }) ?? { mutate: (_i: unknown) => undefined, isPending: false };

  const submitModal = () => {
    if (!modal || !profileId) return;
    if (modal.reason.trim().length < 10) { toast.error("السبب مطلوب (10 أحرف على الأقل)."); return; }
    const recordDate = new Date(modal.recordDate);
    if (modal.mode === "delete") { deleteRecord.mutate({ recordId: modal.recordId!, reason: modal.reason }); setModal(null); return; }
    if (modal.mode === "create") {
      createRecord.mutate({ profileId, recordDate, checkInAt: combineDateTime(modal.recordDate, modal.checkInAt) ?? null, checkOutAt: combineDateTime(modal.recordDate, modal.checkOutAt) ?? null, status: modal.status as "present" | "late" | "absent" | "excused" | "on_leave", reason: modal.reason });
      setModal(null); return;
    }
    updateRecord.mutate({ profileId, recordDate, checkInAt: combineDateTime(modal.recordDate, modal.checkInAt) ?? null, checkOutAt: combineDateTime(modal.recordDate, modal.checkOutAt) ?? null, status: modal.status as "present" | "late" | "absent" | "excused" | "on_leave", reason: modal.reason });
    setModal(null);
  };

  const allRows = (report.data ?? []) as Row[];

  const recordedProfileIds = useMemo(() => new Set(allRows.map(r => r.profileId)), [allRows]);
  const noRecordEmployees = useMemo(() => peopleInUnit.filter(p => !recordedProfileIds.has(p.id)), [peopleInUnit, recordedProfileIds]);

  const rows = useMemo(() => {
    if (filter === "remote") return allRows.filter(r => r.attendanceMode === "remote" || r.attendanceMode === "mixed");
    if (filter === "present") return allRows.filter(r => r.attendance.status === "present");
    if (filter === "late") return allRows.filter(r => r.attendance.status === "late");
    return allRows;
  }, [allRows, filter]);

  const pointsOf = (r: Row) => (r.attendance.positiveMinutes ?? 0) - (r.attendance.negativeMinutes ?? 0);

  const exportExcel = () => {
    const withEmp = showAll || filter === "no_record";
    const header = [
      ...(withEmp ? ["الموظف"] : []),
      "التاريخ", "اليوم", "الدخول", "الخروج", "الحالة", "النقاط",
      "حالة التأكيد", "وقت الإرسال", "وقت التأكيد",
    ];
    const data: (string | number)[][] = [];
    if (filter === "no_record") {
      for (const p of noRecordEmployees) {
        data.push([
          ...(withEmp ? [p.fullName] : []),
          "—", "—", "—", "—", "لم يسجّل بصمة", 0,
          "لم يُرسل", "—", "—",
        ]);
      }
    } else {
      for (const r of rows) {
        data.push([
          ...(withEmp ? [r.profileName] : []),
          fmtDate(r.attendance.recordDate),
          dayNames[toRiyadh(new Date(r.attendance.recordDate)).getUTCDay()],
          fmtTime(r.attendance.checkInAt),
          fmtTime(r.attendance.checkOutAt),
          statusLabels[r.attendance.status] ?? r.attendance.status,
          pointsOf(r),
          confirmationStatusLabel(r.confirmation),
          fmtTime(r.confirmation?.sentAt),
          fmtTime(r.confirmation?.confirmedAt),
        ]);
      }
    }
    const aoa: (string | number)[][] = [header, ...data];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = header.map(() => ({ wch: 16 }));
    for (let c = 0; c < header.length; c++) styleCell(ws, 0, c, { fill: "3F7354", color: "FFFFFF", bold: true, align: "right" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحضور");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true }) as number[];
    const blob = new Blob([new Uint8Array(out)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "تقارير-الحضور-والانصراف.xlsx";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportPdf = () => { window.print(); };

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-6xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-[var(--rakiza-gold)]">إدارة الحضور</p>
            <h1 className="mt-2 text-2xl font-bold text-[var(--rakiza-ink)]">تقارير الحضور والانصراف</h1>
            <p className="mt-1 text-sm text-[var(--rakiza-muted)]">اختر القسم والموظف والنطاق الزمني لعرض وتصدير سجلات الحضور والانصراف.</p>
          </div>
        </div>

        {!canView ? (
          <p className="mt-6 rounded-xl border border-[var(--rakiza-border)] bg-[var(--rakiza-surface)] px-4 py-6 text-center text-sm text-[var(--rakiza-muted)]">عرض سجلات الحضور متاح للمالك والرئيس ومساعد الرئيس والأمين والموارد البشرية فقط.</p>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--rakiza-border)] bg-white p-4">
              <label className="flex flex-col gap-1 text-sm font-bold text-[var(--rakiza-muted)] sm:text-xs">القسم
                <select value={unitId} onChange={e => { setUnitId(e.target.value); setProfileId(null); if (!e.target.value) setShowAll(false); }} className="h-10 min-w-44 rounded-lg border border-[var(--rakiza-border)] bg-white px-3 text-sm font-normal">
                  <option value="">كل الأقسام</option>
                  {(units.data ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold text-[var(--rakiza-muted)] sm:text-xs">الموظف
                <select value={showAll ? "all" : profileId?.toString() ?? ""} onChange={e => { const v = e.target.value; if (v === "all") { setShowAll(true); setProfileId(null); } else { setShowAll(false); setProfileId(v ? Number(v) : null); } }} className="h-10 min-w-52 rounded-lg border border-[var(--rakiza-border)] bg-white px-3 text-sm font-normal">
                  <option value="">اختر موظفاً…</option>
                  <option value="all">كل الموظفين</option>
                  {peopleInUnit.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold text-[var(--rakiza-muted)] sm:text-xs">من تاريخ
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-10 min-w-40 rounded-lg border border-[var(--rakiza-border)] bg-white px-3 text-sm font-normal" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold text-[var(--rakiza-muted)] sm:text-xs">إلى تاريخ
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-10 min-w-40 rounded-lg border border-[var(--rakiza-border)] bg-white px-3 text-sm font-normal" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold text-[var(--rakiza-muted)] sm:text-xs">حالة التأكيد
                <select value={confirmationStatus} onChange={e => setConfirmationStatus(e.target.value as "all" | "confirmed" | "unconfirmed" | "not_sent")} className="h-10 min-w-40 rounded-lg border border-[var(--rakiza-border)] bg-white px-3 text-sm font-normal">
                  <option value="all">الكل</option>
                  <option value="confirmed">مؤكد</option>
                  <option value="unconfirmed">غير مؤكد</option>
                  <option value="not_sent">لم يُرسل</option>
                </select>
              </label>
              {profileId != null && canEdit && (
                <button type="button" onClick={() => setModal({ mode: "create", recordDate: dateFrom, checkInAt: "", checkOutAt: "", status: "present", reason: "" })} className="h-10 rounded-lg bg-[var(--rakiza-olive-strong)] px-4 text-sm font-bold text-white hover:bg-[var(--rakiza-olive-strong)]">➕ إضافة سجل</button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {([["all", "الكل"], ["remote", "المشمولون بالبصمة عن بُعد"], ["present", "الحاضرون"], ["late", "المتأخرون"], ["no_record", "لم يسجّلوا بصمة"]] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === key ? "bg-[var(--rakiza-olive)] text-white" : "border border-[var(--rakiza-border)] text-[var(--rakiza-muted)] hover:bg-[#eef5ec]"}`}>{label}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportExcel} className="rounded-xl border border-[var(--rakiza-border)] px-3 py-2 text-xs font-black text-[var(--rakiza-ink)]">⬇️ تحميل Excel</button>
                <button type="button" onClick={exportPdf} className="rounded-xl bg-[var(--rakiza-olive-strong)] px-3 py-2 text-xs font-black text-white">🖨️ تحميل PDF</button>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--rakiza-border)] bg-white">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[#f7fbf7] text-right text-sm font-bold text-[var(--rakiza-muted)] sm:text-xs">
                  <tr>
                    {showAll && <th className="px-3 py-3">الموظف</th>}
                    <th className="px-3 py-3">التاريخ</th>
                    <th className="px-3 py-3">اليوم</th>
                    <th className="px-3 py-3">الدخول</th>
                    <th className="px-3 py-3">الخروج</th>
                    <th className="px-3 py-3">الحالة</th>
                    <th className="px-3 py-3">النقاط</th>
                    <th className="px-3 py-3">حالة التأكيد</th>
                    <th className="px-3 py-3">وقت الإرسال</th>
                    <th className="px-3 py-3">وقت التأكيد</th>
                    {!showAll && canEdit && <th className="px-3 py-3">إجراء</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee8de]">
                  {filter === "no_record" ? (
                    noRecordEmployees.length === 0 ? (
                      <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-[var(--rakiza-muted)]">لا يوجد موظفون لم يسجّلوا بصمة في هذا النطاق.</td></tr>
                    ) : noRecordEmployees.map(p => (
                      <tr key={p.id} className="hover:bg-[#fafdf9]">
                        {showAll && <td className="px-3 py-2.5 font-bold">{p.fullName}</td>}
                        <td className="px-3 py-2.5">—</td>
                        <td className="px-3 py-2.5 text-[var(--rakiza-muted)]">—</td>
                        <td className="px-3 py-2.5">—</td>
                        <td className="px-3 py-2.5">—</td>
                        <td className="px-3 py-2.5"><span className="rounded-full px-2 py-0.5 text-sm font-bold sm:text-xs bg-[#f0f0ea] text-[var(--rakiza-muted)]">لم يسجّل</span></td>
                        <td className="px-3 py-2.5 font-bold" dir="ltr">0</td>
                        <td className="px-3 py-2.5"><span className="rounded-full px-2 py-0.5 text-sm font-bold sm:text-xs bg-[#f0f0ea] text-[var(--rakiza-muted)]">لم يُرسل</span></td>
                        <td className="px-3 py-2.5">—</td>
                        <td className="px-3 py-2.5">—</td>
                        {!showAll && canEdit && <td className="px-3 py-2.5">—</td>}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-[var(--rakiza-muted)]">{profileId == null && !showAll ? "اختر موظفاً لعرض السجل." : "لا توجد سجلات في هذا النطاق."}</td></tr>
                  ) : rows.map(row => {
                    const a = row.attendance;
                    const dayName = dayNames[toRiyadh(new Date(a.recordDate)).getUTCDay()];
                    const points = (a.positiveMinutes ?? 0) - (a.negativeMinutes ?? 0);
                    return (
                      <tr key={a.id} className="hover:bg-[#fafdf9]">
                        {showAll && <td className="px-3 py-2.5 font-bold">{row.profileName}</td>}
                        <td className="px-3 py-2.5">{fmtDate(a.recordDate)}</td>
                        <td className="px-3 py-2.5 text-[var(--rakiza-muted)]">{dayName}</td>
                        <td className="px-3 py-2.5">{fmtTime(a.checkInAt)}</td>
                        <td className="px-3 py-2.5">{fmtTime(a.checkOutAt)}</td>
                        <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-sm font-bold sm:text-xs ${a.status === "present" ? "bg-[#e4f0e4] text-[var(--rakiza-olive-strong)]" : a.status === "absent" ? "bg-[#f8e6e1] text-[var(--rakiza-danger)]" : a.status === "late" ? "bg-[#f5edd8] text-[var(--rakiza-gold)]" : "bg-[#e3eef5] text-[#2c5d77]"}`}>{statusLabels[a.status] ?? a.status}</span></td>
                        <td className="px-3 py-2.5 font-bold" dir="ltr">{points > 0 ? `+${points}` : points}</td>
                        <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-sm font-bold sm:text-xs ${row.confirmation?.status === "done" ? "bg-[#e4f0e4] text-[var(--rakiza-olive-strong)]" : row.confirmation ? "bg-[#f5edd8] text-[var(--rakiza-gold)]" : "bg-[#f0f0ea] text-[var(--rakiza-muted)]"}`}>{confirmationStatusLabel(row.confirmation)}</span></td>
                        <td className="px-3 py-2.5">{fmtTime(row.confirmation?.sentAt)}</td>
                        <td className="px-3 py-2.5">{fmtTime(row.confirmation?.confirmedAt)}</td>
                        {!showAll && canEdit && (
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              <button type="button" onClick={() => setModal({ mode: "edit", recordId: a.id, recordDate: saudiDateKey(a.recordDate), checkInAt: timeOf(a.checkInAt), checkOutAt: timeOf(a.checkOutAt), status: a.status, reason: "" })} className="rounded border border-[var(--rakiza-gold)] px-2 py-1 text-xs font-bold text-[var(--rakiza-gold)] hover:bg-[#f3e5bf]">✏️ تعديل</button>
                              <button type="button" onClick={() => setModal({ mode: "delete", recordId: a.id, recordDate: saudiDateKey(a.recordDate), checkInAt: "", checkOutAt: "", status: a.status, reason: "" })} className="rounded border border-[#d8b1a4] px-2 py-1 text-xs font-bold text-[var(--rakiza-danger)] hover:bg-[#f8e1dc]">🗑️ حذف</button>
                            </div>
                          </td>
                        )}
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
            <section dir="rtl" className="w-full max-w-lg rounded-[1.6rem] bg-[var(--rakiza-surface)] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--rakiza-gold)] text-white">✏️</span>
                <div>
                  <p className="text-xs font-black text-[var(--rakiza-gold)]">{modal.mode === "create" ? "إضافة سجل حضور" : modal.mode === "delete" ? "حذف سجل حضور" : "تعديل سجل حضور"}</p>
                  <h2 id="owner-attendance-modal-title" className="text-xl font-black text-[#183d2d]">{fmtDate(modal.recordDate)}</h2>
                </div>
              </div>

              {modal.mode === "create" && (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-bold text-[var(--rakiza-muted)]">التاريخ<input type="date" value={modal.recordDate} onChange={e => setModal({ ...modal, recordDate: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--rakiza-border)] bg-white px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-[var(--rakiza-muted)]">وقت الدخول<input type="time" value={modal.checkInAt} onChange={e => setModal({ ...modal, checkInAt: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--rakiza-border)] bg-white px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-[var(--rakiza-muted)]">وقت الخروج<input type="time" value={modal.checkOutAt} onChange={e => setModal({ ...modal, checkOutAt: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--rakiza-border)] bg-white px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-[var(--rakiza-muted)]">الحالة
                    <select value={modal.status} onChange={e => setModal({ ...modal, status: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--rakiza-border)] bg-white px-3 py-2 text-sm font-normal">
                      <option value="present">حاضر</option><option value="late">متأخر</option><option value="absent">غائب</option><option value="excused">مستأذن</option><option value="on_leave">إجازة</option>
                    </select>
                  </label>
                </div>
              )}

              {modal.mode === "edit" && (
                <div className="mt-4 space-y-3">
                  <p className="rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-bold text-[var(--rakiza-olive)]">التاريخ: {fmtDate(modal.recordDate)}</p>
                  <label className="block text-xs font-bold text-[var(--rakiza-muted)]">وقت الدخول<input type="time" value={modal.checkInAt} onChange={e => setModal({ ...modal, checkInAt: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--rakiza-border)] bg-white px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-[var(--rakiza-muted)]">وقت الخروج<input type="time" value={modal.checkOutAt} onChange={e => setModal({ ...modal, checkOutAt: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--rakiza-border)] bg-white px-3 py-2 text-sm font-normal" /></label>
                  <label className="block text-xs font-bold text-[var(--rakiza-muted)]">الحالة
                    <select value={modal.status} onChange={e => setModal({ ...modal, status: e.target.value })} className="mt-1 w-full rounded-md border border-[var(--rakiza-border)] bg-white px-3 py-2 text-sm font-normal">
                      <option value="present">حاضر</option><option value="late">متأخر</option><option value="absent">غائب</option><option value="excused">مستأذن</option><option value="on_leave">إجازة</option>
                    </select>
                  </label>
                </div>
              )}

              {modal.mode === "delete" && <p className="mt-4 rounded-lg border border-[#e8b4a8] bg-[#fdf0ec] px-3 py-2 text-sm font-bold text-[var(--rakiza-danger)]">سيُحذف سجل هذا اليوم نهائياً مع تسجيل العملية في سجل التدقيق.</p>}

              <textarea value={modal.reason} onChange={e => setModal({ ...modal, reason: e.target.value })} placeholder="السبب (10 أحرف على الأقل)…" className="mt-4 w-full rounded-md border border-[var(--rakiza-border)] bg-white px-3 py-2 text-sm" rows={3} />

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-[#e3c7b4] px-3 py-2 text-sm font-bold text-[#9a5c33]">إلغاء</button>
                <button type="button" disabled={modal.reason.trim().length < 10 || (modal.mode === "create" && !modal.recordDate) || updateRecord.isPending || createRecord.isPending || deleteRecord.isPending} onClick={submitModal} className="rounded-lg bg-[var(--rakiza-olive)] px-3 py-2 text-sm font-black text-white">{modal.mode === "delete" ? "حذف نهائي" : "حفظ"}</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}

