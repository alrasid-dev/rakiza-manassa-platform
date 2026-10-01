import DashboardLayout from "@/components/DashboardLayout";
import TeamBalancesTable from "@/components/TeamBalancesTable";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";

const statusLabels: Record<string, string> = {
  pending: "بانتظار ردك",
  under_review: "بانتظار قرار المدير",
  escalated: "مُصعَّد للأمين",
  approved: "محفوظ في السجل",
  returned: "مُعاد",
  rejected: "مرفوض",
  cancelled: "ملغاة",
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
  const myCases = trpc.court.disciplinary.mine.useQuery();
  const teamCases = trpc.court.disciplinary.myTeam.useQuery();
  const respond = trpc.court.disciplinary.respond.useMutation();
  const decide = trpc.court.disciplinary.managerDecision.useMutation();
  const bulkReview = trpc.court.disciplinary.bulkReview.useMutation();
  const utils = trpc.useUtils();

  const [responses, setResponses] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  // فلاتر التصنيف
  const [typeFilter, setTypeFilter] = useState<"all" | "attendance" | "task">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"newest" | "oldest">("newest");

  // اعتماد مجمّع
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const refresh = () => {
    utils.court.disciplinary.mine.invalidate();
    utils.court.disciplinary.myTeam.invalidate();
  };

  const filteredTeam = useMemo(() => {
    const rows = (teamCases.data ?? []) as CaseRow[];
    return rows
      .filter(c => (typeFilter === "all" ? true : c.source === typeFilter))
      .filter(c => (statusFilter === "all" ? true : c.status === statusFilter))
      .filter(c => (search.trim() ? (c.employeeName || "").includes(search.trim()) : true))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortDir === "newest" ? tb - ta : ta - tb;
      });
  }, [teamCases.data, typeFilter, statusFilter, search, sortDir]);

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

  const allTeamSelected = filteredTeam.length > 0 && filteredTeam.every(c => selectedIds.includes(c.id));
  const toggleSelect = (id: number) => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const toggleSelectAll = () => setSelectedIds(allTeamSelected ? [] : filteredTeam.map(c => c.id));

  const runBulk = (decision: "save" | "cancel" | "escalate") => {
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
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)} className="rounded border border-[#e7e0d4] bg-white px-2 py-1 text-sm">
            <option value="all">النوع: الكل</option>
            <option value="attendance">حضور</option>
            <option value="task">مهمة</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded border border-[#e7e0d4] bg-white px-2 py-1 text-sm">
            <option value="all">الحالة: الكل</option>
            {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم…" className="rounded border border-[#e7e0d4] bg-white px-2 py-1 text-sm" />
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
                    <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelect(c.id)} className="h-4 w-4 accent-[#2f7653]" />
                    <span className="font-bold text-[#29463b]">{c.employeeName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.source && <span className="rounded bg-[#eef4f0] px-2 py-1 text-xs text-[#2f7653]">{typeLabels[c.source] || c.source}</span>}
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs">{statusLabels[c.status] || c.status}</span>
                    <span className="text-sm text-gray-500">{c.createdAt ? new Date(c.createdAt).toLocaleDateString("ar-SA") : ""}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{c.requestNote}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => decide.mutate({ caseId: c.id, decision: "save", note: notes[c.id] }, { onSuccess: refresh })}
                    className="rounded bg-[#006c35] px-3 py-2 text-white text-sm"
                  >✅ حفظ</button>
                  <button
                    onClick={() => decide.mutate({ caseId: c.id, decision: "cancel", note: notes[c.id] }, { onSuccess: refresh })}
                    className="rounded bg-gray-600 px-3 py-2 text-white text-sm"
                  >❌ إلغاء</button>
                  <button
                    onClick={() => decide.mutate({ caseId: c.id, decision: "escalate", note: notes[c.id] }, { onSuccess: refresh })}
                    className="rounded bg-amber-600 px-3 py-2 text-white text-sm"
                  >⬆️ تصعيد</button>
                </div>
                <input
                  type="text"
                  value={notes[c.id] || ""}
                  onChange={e => setNotes({ ...notes, [c.id]: e.target.value })}
                  placeholder="ملاحظة (اختياري)"
                  className="mt-2 w-full rounded border p-2 text-sm"
                />
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
      </section>
    </DashboardLayout>
  );
}
