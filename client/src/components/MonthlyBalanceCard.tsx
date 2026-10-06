import { trpc } from "@/lib/trpc";
import { useState } from "react";

function signed(value: number) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "0";
}

type Balance = { positiveMinutes: number; negativeMinutes: number; excuseMinutes: number; penaltyMinutes: number; netMinutes: number };

function BalanceTable({ title, balance }: { title: string; balance: Balance | null | undefined }) {
  const b = balance ?? { positiveMinutes: 0, negativeMinutes: 0, excuseMinutes: 0, penaltyMinutes: 0, netMinutes: 0 };
  return (
    <div className="rounded-xl border border-[#e7dccd] bg-white">
      <div className="border-b border-[#eee4d3] px-4 py-2 text-sm font-semibold text-[#4a3b28]">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-b border-[#f3ecdf]">
            <td className="px-4 py-2 text-[#6b5b45]">له (إيجابي)</td>
            <td className="px-4 py-2 text-left font-medium text-emerald-700">{signed(b.positiveMinutes)}</td>
          </tr>
          <tr className="border-b border-[#f3ecdf]">
            <td className="px-4 py-2 text-[#6b5b45]">عليه (سلبي)</td>
            <td className="px-4 py-2 text-left font-medium text-red-700">−{b.negativeMinutes}</td>
          </tr>
          <tr className="border-b border-[#f3ecdf]">
            <td className="px-4 py-2 text-[#6b5b45]">عقوبات</td>
            <td className="px-4 py-2 text-left font-medium text-orange-700">−{b.penaltyMinutes}</td>
          </tr>
          <tr className="border-b border-[#f3ecdf]">
            <td className="px-4 py-2 text-[#6b5b45]">استئذانات</td>
            <td className="px-4 py-2 text-left font-medium text-sky-700">+{b.excuseMinutes}</td>
          </tr>
          <tr>
            <td className="px-4 py-2 font-semibold text-[#4a3b28]">الصافي</td>
            <td className={`px-4 py-2 text-left font-bold ${b.netMinutes >= 0 ? "text-emerald-700" : "text-red-700"}`}>{signed(b.netMinutes)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function MonthlyBalanceCard() {
  const [mode, setMode] = useState<"monthly" | "cumulative">("monthly");
  const months = trpc.court.balances.myAvailableMonths.useQuery();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const currentMonth = months.data?.[0] ?? null;
  const activeMonth = selectedMonth ?? currentMonth;
  const monthly = trpc.court.balances.myMonthlyBalance.useQuery(
    { hijriMonthKey: activeMonth ?? undefined },
    { enabled: mode === "monthly" && Boolean(activeMonth) },
  );
  const cumulative = trpc.court.balances.myCumulativeBalance.useQuery(undefined, { enabled: mode === "cumulative" });

  return (
    <div className="rounded-xl border border-[#e7dccd] bg-[#fbf7ef] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#4a3b28]">📊 رصيد الشهر</h3>
        <div className="flex items-center gap-1 rounded-lg bg-[#efe6d5] p-1 text-xs">
          <button type="button" onClick={() => setMode("monthly")} className={`rounded-md px-3 py-1 ${mode === "monthly" ? "bg-white text-[#4a3b28] shadow-sm" : "text-[#8a7a60]"}`}>شهري</button>
          <button type="button" onClick={() => setMode("cumulative")} className={`rounded-md px-3 py-1 ${mode === "cumulative" ? "bg-white text-[#4a3b28] shadow-sm" : "text-[#8a7a60]"}`}>تراكمي</button>
        </div>
      </div>

      {mode === "monthly" && (
        <select
          value={activeMonth ?? ""}
          onChange={e => setSelectedMonth(e.target.value || null)}
          className="mb-3 w-full rounded-lg border border-[#e7dccd] bg-white px-3 py-2 text-sm text-[#4a3b28]"
        >
          {(months.data ?? []).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      )}

      {mode === "monthly"
        ? <BalanceTable title={`رصيد شهر ${activeMonth ?? ""}`} balance={monthly.data} />
        : <BalanceTable title="الرصيد التراكمي (كل الأشهر)" balance={cumulative.data} />}

      <p className="mt-3 text-xs leading-5 text-[#8a7a60]">يُقفل الرصيد تلقائياً في نهاية كل شهر هجري. العرض بالدقائق.</p>
    </div>
  );
}
