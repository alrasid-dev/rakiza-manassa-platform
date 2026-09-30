import { trpc } from "@/lib/trpc";
import { useState } from "react";

function signed(value: number) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "0";
}

type TeamRow = { profileId: number; fullName: string; positiveMinutes: number; negativeMinutes: number; excuseMinutes: number; netMinutes: number };

export default function TeamBalancesTable() {
  const [mode, setMode] = useState<"monthly" | "cumulative">("monthly");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const monthly = trpc.court.balances.teamMonthlyBalances.useQuery(
    { hijriMonthKey: selectedMonth },
    { enabled: mode === "monthly" && Boolean(selectedMonth) },
  );
  const cumulative = trpc.court.balances.teamCumulativeBalances.useQuery(undefined, { enabled: mode === "cumulative" });

  const rows: TeamRow[] = mode === "monthly" ? (monthly.data ?? []) : (cumulative.data ?? []);

  return (
    <div className="rounded-xl border border-[#e7dccd] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#4a3b28]">👥 أرصدة الفريق</h3>
        <div className="flex items-center gap-1 rounded-lg bg-[#efe6d5] p-1 text-xs">
          <button type="button" onClick={() => setMode("monthly")} className={`rounded-md px-3 py-1 ${mode === "monthly" ? "bg-white text-[#4a3b28] shadow-sm" : "text-[#8a7a60]"}`}>شهري</button>
          <button type="button" onClick={() => setMode("cumulative")} className={`rounded-md px-3 py-1 ${mode === "cumulative" ? "bg-white text-[#4a3b28] shadow-sm" : "text-[#8a7a60]"}`}>تراكمي</button>
        </div>
      </div>

      {mode === "monthly" && (
        <input
          type="text"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          placeholder="مفتاح الشهر الهجري (مثال: 1447-10)"
          className="mb-3 w-full rounded-lg border border-[#e7dccd] bg-white px-3 py-2 text-sm text-[#4a3b28]"
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#eee4d3] text-[#6b5b45]">
              <th className="px-3 py-2 text-right font-medium">الموظف</th>
              <th className="px-3 py-2 font-medium">له</th>
              <th className="px-3 py-2 font-medium">عليه</th>
              <th className="px-3 py-2 font-medium">استئذان</th>
              <th className="px-3 py-2 font-medium">الصافي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.profileId} className="border-b border-[#f3ecdf]">
                <td className="px-3 py-2 text-[#4a3b28]">{row.fullName}</td>
                <td className="px-3 py-2 text-emerald-700">{signed(row.positiveMinutes)}</td>
                <td className="px-3 py-2 text-red-700">−{row.negativeMinutes}</td>
                <td className="px-3 py-2 text-sky-700">+{row.excuseMinutes}</td>
                <td className={`px-3 py-2 font-bold ${row.netMinutes >= 0 ? "text-emerald-700" : "text-red-700"}`}>{signed(row.netMinutes)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-[#8a7a60]">
                  {mode === "monthly" ? "أدخل مفتاح الشهر لعرض الأرصدة." : "لا توجد بيانات تراكمية."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
