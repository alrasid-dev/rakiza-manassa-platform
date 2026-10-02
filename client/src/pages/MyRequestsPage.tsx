import DashboardLayout from "@/components/DashboardLayout";
import RequestRouteTimeline from "@/components/RequestRouteTimeline";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

const typeLabels: Record<string, string> = {
  leave: "إجازة",
  permission: "استئذان",
  disciplinary: "مساءلة",
  task_approval: "اعتماد مهمة",
};

const statusLabels: Record<string, string> = {
  pending: "قيد الانتظار",
  under_review: "بانتظار المدير",
  approved: "معتمد",
  rejected: "مرفوض",
  returned: "مُعاد",
  cancelled: "ملغاة",
  escalated: "مُصعَّد",
  active: "نشطة",
  completed: "مكتملة",
  pending_owner_approval: "بانتظار الأمين",
};

type Item = { id: number; type: string; requestType: string; status: string; createdAt: string; title: string; submitterName: string };

function Card({ item }: { item: Item }) {
  const showTimeline = item.type !== "task_approval";
  return (
    <div className="rounded-xl border border-[#e7e0d4] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="rounded bg-[#eef4f0] px-2 py-0.5 text-xs text-[#2f7653]">{typeLabels[item.type] ?? item.type}</span>
          <span className="ml-2 text-xs font-bold text-[#29463b]">{item.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{statusLabels[item.status] ?? item.status}</span>
          <span className="text-xs text-gray-500">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("ar-SA") : ""}</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-[#75837c]">مقدم الطلب: {item.submitterName}</p>
      {showTimeline && <RequestRouteTimeline requestId={item.id} requestType={item.requestType as "leave" | "permission" | "disciplinary"} />}
      {item.type === "task_approval" && <a href="/tasks?tab=approvals" className="mt-2 inline-block text-xs font-bold text-[#2f7653] underline">فتح الاعتماد</a>}
    </div>
  );
}

export default function MyRequestsPage() {
  const [tab, setTab] = useState<"submitted" | "toReview" | "returned" | "disciplinary">("submitted");
  const dash = trpc.court.requests.myDashboard.useQuery();

  const tabs = [
    { key: "submitted" as const, label: "📤 طلباتي" },
    { key: "toReview" as const, label: "📥 اعتماداتي" },
    { key: "returned" as const, label: "🔄 العائد إليّ" },
    { key: "disciplinary" as const, label: "⚖️ مساءلاتي" },
  ];

  const list = dash.data?.[tab] ?? [];

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold text-[#12352f]">طلباتي واعتماداتي</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === t.key ? "bg-[#12352f] text-white" : "bg-[#eef4f0] text-[#2f7653]"}`}>{t.label}</button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {dash.isLoading ? <p className="text-gray-500">جارٍ التحميل…</p> : list.length ? list.map((item: Item) => <Card key={`${item.type}-${item.id}`} item={item} />) : <p className="text-gray-500">لا توجد عناصر في هذا التبويب.</p>}
        </div>
      </section>
    </DashboardLayout>
  );
}
