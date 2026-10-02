import DashboardLayout from "@/components/DashboardLayout";
import TeamBalancesTable from "@/components/TeamBalancesTable";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import RequestRouteTimeline from "@/components/RequestRouteTimeline";

const statusLabels: Record<string, string> = {
  pending: "قيد الانتظار",
  under_review: "بانتظار قرار المدير",
  escalated: "مُصعَّد للأمين",
  approved: "محفوظ في السجل",
  returned: "مُعاد",
  rejected: "مرفوض",
  cancelled: "ملغاة",
  closed: "مُغلق",
};

const typeLabels: Record<string, string> = { attendance: "حضور", task: "مهمة" };

type CaseRow = {
  id: number;
  status: string;
  source?: string;
  sourceLabel?: string;
  employeeName?: string;
  employeeUnitId?: number | null;
  requestNote?: string | null;
  createdAt?: string | Date | null;
};

export default function DisciplinaryPage() {
  const utils = trpc.useUtils();

  // فلاتر التصنيف (تُمرر للخادم لتصفية مساءلات الفريق)
  const [typeFilter, setTypeFilter] = useState<"all" | "attendance" | "task">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "returned" | "approved" | "rejected" | "cancelled" | "under_review" | "escalated" | "closed">("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"newest" | "oldest">("newest");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const units = trpc.court.units.list.useQuery();
  const people = trpc.court.people.list.useQuery();
  const permission = trpc.court.registration.myPermission.useQuery();
  const roles = trpc.court.myRoles.useQuery();
  const roleList: string[] = roles.data ?? [];
  const isManager = roleList.some(role => ["department_manager", "trainee_affairs_manager"].includes(role));
  const isLeadership = permission.data === "full_control" || roleList.some(role => ["court_president", "assistant_president", "court_secretary"].includes(role));
  const isOwner = permission.data === "full_control";
  const canDecideCase = (c: CaseRow) => !isOwner || c.status === "escalated" || roleList.includes("court_secretary") || roleList.includes("court_president");
  const isActionable = (c: CaseRow) => (c.status === "under_review" || c.status === "escalated") && canDecideCase(c);
  const disabledReason = (c: CaseRow) => {
    if (c.status === "pending") return "بانتظار رد الموظف";
    if (["approved", "rejected", "closed", "returned", "cancelled"].includes(c.status)) return "تم البت في هذه المساءلة";
    if (!canDecideCase(c)) return "ليس لديك صلاحية";
    return "";
  };

  const myCases = trpc.court.disciplinary.mine.useQuery();
  const teamCases = trpc.court.disciplinary.myTeam.useQuery({
    unitId: unitFilter !== "all" ? Number(unitFilter) : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    searchQuery: search.trim() || undefined,
  });
  const respond = trpc.court.disciplinary.respond.useMutation();
  const decide = trpc.court.disciplinary.managerDecision.useMutation();
  const bulkReview = trpc.court.disciplinary.bulkReview.useMutation();
  const teamLog = trpc.court.disciplinary.teamLog.useQuery({
    unitId: unitFilter !== "all" ? Number(unitFilter) : undefined,
    assigneeProfileId: employeeFilter !== "all" ? Number(employeeFilter) : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    searchQuery: search.trim() || undefined,
  }, { enabled: isManager || isLeadership });

  const [responses, setResponses] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  // اعتماد مجمّع
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const refresh = () => {
    utils.court.disciplinary.mine.invalidate();
    utils.court.disciplinary.myTeam.invalidate();
  };

  const filteredTeam = useMemo(() => {
    const rows = (teamCases.data ?? []) as CaseRow[];
    return [...rows].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortDir === "newest" ? tb - ta : ta - tb;
    });
  }, [teamCases.data, sortDir]);

  const filteredMine = useMemo(() => {
    const rows = (myCases.data ?? []) as CaseRow[];
    return rows
      .filter(c => (typeFilter === "all" ? true : c.source === typeFilter))
      .filter(c => (statusFilter === "all" ? true : c.status === statusFilter))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortDir === "newest" ? tb - ta : ta - tb;
      });
  }, [myCases.data, typeFilter, statusFilter, sortDir]);

  const selectableTeam = filteredTeam.filter(c => isActionable(c));
  const allTeamSelected = selectableTeam.length > 0 && selectableTeam.every(c => selectedIds.includes(c.id));
  const toggleSelect = (id: number) => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const toggleSelectAll = () => setSelectedIds(allTeamSelected ? [] : selectableTeam.map(c => c.id));

  const runBulk = (decision: "save" | "cancel" | "escalate" | "reject" | "return") => {
    bulkReview.mutate({ caseIds: selectedIds, decision }, {
      onSuccess: () => { setSelectedIds([]); refresh(); },
      onError: e => alert(e.message || "تعذر التنفيذ المجمّع."),
    });
  };

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold text-[#12352f]">المساءلات</h1>

        {/* شريط التصنيف */}
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#e7e0d4] bg-[#fbf6ec] p-3">
          <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)} className="rounded border border-[#e7e0d4] bg-white px-2 py-1 text-sm">
            <option value="all">القسم: الكل</option>
            {(units.data ?? []).map(unit => <option key={unit.id} value={String(unit.id)}>{unit.name}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)} className="rounded border border-[#e7e0d4] bg-white px-2 py-1 text-sm">
            <option value="all">النوع: الكل</option>
            <option value="attendance">حضور</option>
            <option value="task">مهمة</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded border border-[#e7e0d4] bg-white px-2 py-1 text-sm">
            <option value="all">الحالة: الكل</option>
            {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم…" className="rounded border border-[#e7e0d4] bg-white px-2 py-1 text-sm" />
          <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)} className="rounded border border-[#e7e0d4] bg-white px-2 py-1 text-sm">
            <option value="all">الموظف: الكل</option>
            {(people.data ?? []).map(person => <option key={person.id} value={String(person.id)}>{person.fullName}</option>)}
          </select>
          <select value={sortDir} onChange={e => setSortDir(e.target.value as typeof sortDir)} className="rounded border border-[#e7e0d4] bg-white px-2 py-1 text-sm">
            <option value="newest">الأحدث أولاً</option>
            <option value="oldest">الأقدم أولاً</option>
          </select>
        </div>

        <section className="mt-6">
          <h2 className="text-lg font-bold text-[#12352f]">مساءلاتي{filteredMine.length ? ` (${filteredMine.length})` : ""}</h2>
          {myCases.isLoading && <p className="mt-2 text-gray-500">جارٍ تحميل مساءلاتك…</p>}
          {myCases.error && (
            <p className="mt-2 rounded-lg border border-[#e7d9c4] bg-[#fbf6ec] px-3 py-2 text-sm text-[#8a6d20]">
              {myCases.error.data?.code === "FORBIDDEN"
                ? "سجل المساءلات الشخصي متاح للموظفين والملازمين فقط. تُعرض مساءلات فريقك أدناه (إن وُجدت)."
                : myCases.error.message || "تعذر تحميل مساءلاتك."}
            </p>
          )}
          {filteredMine.map(c => (
            <div key={c.id} className="mt-3 rounded-lg border border-[#e7e0d4] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[#29463b]">{c.sourceLabel || (c.source === "attendance" ? "مساءلة حضور" : "مساءلة مهمة")}</span>
                <div className="flex items-center gap-2">
                  {c.source && <span className="rounded bg-[#eef4f0] px-2 py-1 text-xs text-[#2f7653]">{typeLabels[c.source] || c.source}</span>}
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs">{statusLabels[c.status] || c.status}</span>
                  <span className="text-sm text-gray-500">{c.createdAt ? new Date(c.createdAt).toLocaleDateString("ar-SA") : ""}</span>
                </div>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{c.requestNote || "—"}</p>
              <RequestRouteTimeline requestId={c.id} requestType="disciplinary" />
              {c.status === "pending" && (
                <div className="mt-3">
                  <textarea
                    value={responses[c.id] || ""}
                    onChange={e => setResponses({ ...responses, [c.id]: e.target.value })}
                    placeholder="اكتب ردك (10-2000 حرف)"
                    className="w-full rounded border p-2"
                    rows={3}
                  />
                  <button
                    onClick={() => respond.mutate({ caseId: c.id, response: responses[c.id] }, { onSuccess: refresh })}
                    disabled={(responses[c.id]?.length || 0) < 10 || respond.isPending}
                    className="mt-2 rounded bg-[#006c35] px-4 py-2 text-white disabled:opacity-50"
                  >
                    إرسال الرد
                  </button>
                </div>
              )}
            </div>
          ))}
          {!myCases.isLoading && !myCases.error && !filteredMine.length && <p className="mt-2 text-gray-500">لا توجد مساءلات شخصية ضمن سجلك حتى الآن.</p>}
        </section>

        {teamCases.data && teamCases.data.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-[#12352f]">قرارات بانتظار عنايتك{filteredTeam.length ? ` (${filteredTeam.length})` : ""}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-sm text-[#29463b]">
                <input type="checkbox" checked={allTeamSelected} onChange={toggleSelectAll} className="h-4 w-4 accent-[#2f7653]" />
                اختر الكل
              </label>
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => runBulk("save")} disabled={bulkReview.isPending} className="rounded bg-[#006c35] px-3 py-1 text-white text-sm">حفظ المحدد</button>
                  <button onClick={() => runBulk("cancel")} disabled={bulkReview.isPending} className="rounded bg-gray-600 px-3 py-1 text-white text-sm">إلغاء المحدد</button>
                  <button onClick={() => runBulk("escalate")} disabled={bulkReview.isPending} className="rounded bg-amber-600 px-3 py-1 text-white text-sm">تصعيد المحدد</button>
                </div>
              )}
            </div>
            {filteredTeam.map(c => (
              <div key={c.id} className="mt-3 rounded-lg border border-[#e7e0d4] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isActionable(c) && <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelect(c.id)} className="h-4 w-4 accent-[#2f7653]" />}
                    <span className="font-bold text-[#29463b]">طلب إجراء تأديبي — {c.employeeName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.source && <span className="rounded bg-[#eef4f0] px-2 py-1 text-xs text-[#2f7653]">{typeLabels[c.source] || c.source}</span>}
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs">{statusLabels[c.status] || c.status}</span>
                    <span className="text-sm text-gray-500">{c.createdAt ? new Date(c.createdAt).toLocaleDateString("ar-SA") : ""}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{c.requestNote}</p>
                <RequestRouteTimeline requestId={c.id} requestType="disciplinary" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => decide.mutate({ caseId: c.id, decision: "save", note: notes[c.id] }, { onSuccess: refresh })}
                    disabled={!isActionable(c)}
                    title={disabledReason(c)}
                    className={`rounded px-3 py-2 text-sm ${isActionable(c) ? "bg-[#006c35] text-white hover:bg-green-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                  >✅ اعتماد</button>
                  <button
                    type="button"
                    onClick={() => decide.mutate({ caseId: c.id, decision: "reject", note: notes[c.id] }, { onSuccess: refresh })}
                    disabled={!isActionable(c)}
                    title={disabledReason(c)}
                    className={`rounded px-3 py-2 text-sm ${isActionable(c) ? "bg-[#b3412e] text-white hover:bg-red-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                  >❌ رفض</button>
                  <button
                    type="button"
                    onClick={() => decide.mutate({ caseId: c.id, decision: "return", note: notes[c.id] }, { onSuccess: refresh })}
                    disabled={!isActionable(c)}
                    title={disabledReason(c)}
                    className={`rounded px-3 py-2 text-sm ${isActionable(c) ? "bg-[#8a6d20] text-white hover:bg-amber-800" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                  >🔄 عودة للتصحيح</button>
                  <button
                    type="button"
                    onClick={() => decide.mutate({ caseId: c.id, decision: "escalate", note: notes[c.id] }, { onSuccess: refresh })}
                    disabled={!isActionable(c)}
                    title={disabledReason(c)}
                    className={`rounded px-3 py-2 text-sm ${isActionable(c) ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                  >⬆️ تصعيد</button>
                  <button
                    type="button"
                    onClick={() => decide.mutate({ caseId: c.id, decision: "save_and_close", note: notes[c.id] }, { onSuccess: refresh })}
                    disabled={!isActionable(c)}
                    title={disabledReason(c)}
                    className={`rounded px-3 py-2 text-sm ${isActionable(c) ? "bg-[#4a5f70] text-white hover:bg-teal-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                  >💾 حفظ وإغلاق</button>
                </div>
                <input
                  type="text"
                  value={notes[c.id] || ""}
                  onChange={e => setNotes({ ...notes, [c.id]: e.target.value })}
                  disabled={!isActionable(c)}
                  placeholder="ملاحظة (اختياري)"
                  className="mt-2 w-full rounded border p-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                />
                {!isActionable(c) && <p className="mt-2 text-sm text-gray-500">{disabledReason(c)}</p>}
              </div>
            ))}
          </section>
        )}
        {teamCases.data && teamCases.data.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-[#12352f]">أرصدة الفريق</h2>
            <div className="mt-3"><TeamBalancesTable /></div>
          </section>
        )}
        {(isManager || isLeadership) && <section className="mt-8">
          <h2 className="text-lg font-bold text-[#12352f]">سجل مساءلات فريقي</h2>
          {teamLog.isLoading ? <p className="mt-2 text-gray-500">جارٍ التحميل…</p> : teamLog.data?.length ? (
            <div className="mt-3 overflow-x-auto rounded-xl border border-[#e7e0d4] bg-white">
              <table className="w-full min-w-[760px] text-right text-sm">
                <thead className="bg-[#12352f] text-xs text-white">
                  <tr><th className="px-3 py-2">الموظف</th><th className="px-3 py-2">القسم</th><th className="px-3 py-2">النوع</th><th className="px-3 py-2">السبب</th><th className="px-3 py-2">الحالة</th><th className="px-3 py-2">التاريخ</th></tr>
                </thead>
                <tbody className="divide-y divide-[#f2eee7]">
                  {teamLog.data.map((row: any) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-bold text-[#29463b]">{row.employeeName}</td>
                      <td className="px-3 py-2 text-xs">{row.unitName ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{row.type === "attendance" ? "حضور" : "مهمة"}</td>
                      <td className="px-3 py-2 text-xs">{row.reason ?? "—"}</td>
                      <td className="px-3 py-2"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{statusLabels[row.status] ?? row.status}</span></td>
                      <td className="px-3 py-2 text-xs">{row.createdAt ? new Date(row.createdAt).toLocaleDateString("ar-SA") : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-2 text-gray-500">لا توجد مساءلات ضمن سجل فريقك.</p>}
        </section>}
      </section>
    </DashboardLayout>
  );
}
