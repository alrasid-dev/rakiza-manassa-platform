import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

const statusLabels: Record<string, string> = {
  pending: "بانتظار ردك",
  under_review: "بانتظار قرار المدير",
  escalated: "مُصعَّد للأمين",
  approved: "محفوظ في السجل",
  returned: "مُعاد",
  rejected: "مرفوض",
  cancelled: "ملغاة",
};

export default function DisciplinaryPage() {
  const myCases = trpc.court.disciplinary.mine.useQuery();
  const teamCases = trpc.court.disciplinary.myTeam.useQuery();
  const respond = trpc.court.disciplinary.respond.useMutation();
  const decide = trpc.court.disciplinary.managerDecision.useMutation();
  const utils = trpc.useUtils();

  const [responses, setResponses] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  const refresh = () => {
    utils.court.disciplinary.mine.invalidate();
    utils.court.disciplinary.myTeam.invalidate();
  };

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold text-[#12352f]">المساءلات</h1>

        <section className="mt-6">
          <h2 className="text-lg font-bold text-[#12352f]">مساءلاتي</h2>
          {myCases.data?.map(c => (
            <div key={c.id} className="mt-3 rounded-lg border border-[#e7e0d4] bg-white p-4">
              <div className="flex justify-between">
                <span className="font-bold text-[#29463b]">{c.sourceLabel}</span>
                <span className="text-sm text-gray-500">{new Date(c.createdAt).toLocaleDateString("ar-SA")}</span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{c.requestNote}</p>
              <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-1 text-xs">{statusLabels[c.status] || c.status}</span>
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
          {!myCases.data?.length && <p className="mt-2 text-gray-500">لا توجد مساءلات.</p>}
        </section>

        {teamCases.data && teamCases.data.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-[#12352f]">مساءلات فريقي</h2>
            {teamCases.data.map(c => (
              <div key={c.id} className="mt-3 rounded-lg border border-[#e7e0d4] bg-white p-4">
                <div className="flex justify-between">
                  <span className="font-bold text-[#29463b]">{c.employeeName}</span>
                  <span className="text-sm text-gray-500">{new Date(c.createdAt).toLocaleDateString("ar-SA")}</span>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{c.requestNote}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => decide.mutate({ caseId: c.id, decision: "escalate", note: notes[c.id] }, { onSuccess: refresh })}
                    className="rounded bg-amber-600 px-3 py-2 text-white text-sm"
                  >تصعيد للأمين</button>
                  <button
                    onClick={() => decide.mutate({ caseId: c.id, decision: "save", note: notes[c.id] }, { onSuccess: refresh })}
                    className="rounded bg-gray-600 px-3 py-2 text-white text-sm"
                  >حفظ في السجل</button>
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
      </section>
    </DashboardLayout>
  );
}
