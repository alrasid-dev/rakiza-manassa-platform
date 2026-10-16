import DashboardLayout from "@/components/DashboardLayout";
import RequestRouteTimeline from "@/components/RequestRouteTimeline";
import { trpc } from "@/lib/trpc";
import { usePermissionsSnapshot } from "@/hooks/usePermissionsSnapshot";
import { useState } from "react";
import { toast } from "sonner";

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
  closed: "مُغلق",
  active: "نشطة",
  completed: "مكتملة",
  pending_owner_approval: "بانتظار الأمين",
};

type Item = { id: number; type: string; requestType: string; status: string; createdAt: string; title: string; submitterName: string };
type DecisionAction = "approve" | "reject" | "escalate" | "return";

const isActionable = (item: Item) => {
  if (item.status === "pending" && item.type === "disciplinary") return false;
  if (item.status === "pending" && (item.type === "leave" || item.type === "permission")) return true;
  if (["approved", "rejected", "closed", "saved"].includes(item.status)) return false;
  return true;
};

const disabledReason = (item: Item) => {
  if (item.status === "pending" && item.type === "disciplinary") return "بانتظار رد الموظف";
  if (["approved", "rejected", "closed"].includes(item.status)) return "تم البت في الطلب";
  if (item.status === "saved") return "محفوظ";
  return "";
};

function Card({ item, reviewable, canApprove, canReject, canEscalate, canReturn, onAction }: {
  item: Item;
  reviewable: boolean;
  canApprove: boolean;
  canReject: boolean;
  canEscalate: boolean;
  canReturn: boolean;
  onAction: (item: Item, action: DecisionAction, rating?: "excellent" | "good" | "acceptable") => void;
}) {
  const showTimeline = item.type !== "task_approval";
  const isDisciplinary = item.type === "disciplinary";
  return (
    <div className="rounded-xl border border-[var(--rakiza-border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="rounded bg-[#eef4f0] px-2 py-0.5 text-xs text-[var(--rakiza-olive-strong)]">{typeLabels[item.type] ?? item.type}</span>
          <span className="ml-2 text-xs font-bold text-[var(--rakiza-ink)]">{item.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{statusLabels[item.status] ?? item.status}</span>
          <span className="text-xs text-[var(--rakiza-muted)]">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }) : ""}</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--rakiza-muted)]">مقدم الطلب: {item.submitterName}</p>
      {showTimeline && <RequestRouteTimeline requestId={item.id} requestType={item.requestType as "leave" | "permission" | "disciplinary"} />}
      {item.type === "task_approval" && <a href="/tasks?tab=approvals" className="mt-2 inline-block text-xs font-bold text-[var(--rakiza-olive-strong)] underline">فتح الاعتماد</a>}
      {reviewable && item.type === "task_approval" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/tasks?tab=approvals" className="rounded-lg px-3 py-1.5 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700">📄 تفاصيل</a>
          <button type="button" onClick={() => onAction(item, "approve", "excellent")} disabled={!isActionable(item) || !canApprove} title={disabledReason(item) || (!canApprove ? "ليس لديك صلاحية" : "")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isActionable(item) && canApprove ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-200 text-[var(--rakiza-muted)] cursor-not-allowed"}`}>🟢 ممتاز</button>
          <button type="button" onClick={() => onAction(item, "approve", "good")} disabled={!isActionable(item) || !canApprove} title={disabledReason(item) || (!canApprove ? "ليس لديك صلاحية" : "")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isActionable(item) && canApprove ? "bg-yellow-500 text-white hover:bg-yellow-600" : "bg-gray-200 text-[var(--rakiza-muted)] cursor-not-allowed"}`}>🟡 متوسط</button>
          <button type="button" onClick={() => onAction(item, "approve", "acceptable")} disabled={!isActionable(item) || !canApprove} title={disabledReason(item) || (!canApprove ? "ليس لديك صلاحية" : "")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isActionable(item) && canApprove ? "bg-red-500 text-white hover:bg-red-600" : "bg-gray-200 text-[var(--rakiza-muted)] cursor-not-allowed"}`}>🔴 مقبول</button>
          <button type="button" onClick={() => onAction(item, "reject")} disabled={!isActionable(item) || !canReject} title={disabledReason(item) || (!canReject ? "ليس لديك صلاحية" : "")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isActionable(item) && canReject ? "bg-red-600 text-white hover:bg-red-700" : "bg-gray-200 text-[var(--rakiza-muted)] cursor-not-allowed"}`}>❌ رفض</button>
        </div>
      )}
      {reviewable && item.type !== "task_approval" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => onAction(item, "approve")} disabled={!isActionable(item) || !canApprove} title={disabledReason(item) || (!canApprove ? "ليس لديك صلاحية" : "")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isActionable(item) && canApprove ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-200 text-[var(--rakiza-muted)] cursor-not-allowed"}`}>✅ اعتماد</button>
          <button type="button" onClick={() => onAction(item, "reject")} disabled={!isActionable(item) || !canReject} title={disabledReason(item) || (!canReject ? "ليس لديك صلاحية" : "")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isActionable(item) && canReject ? "bg-red-600 text-white hover:bg-red-700" : "bg-gray-200 text-[var(--rakiza-muted)] cursor-not-allowed"}`}>❌ رفض</button>
          <button type="button" onClick={() => onAction(item, "escalate")} disabled={!isActionable(item) || !canEscalate} title={disabledReason(item) || (!canEscalate ? "ليس لديك صلاحية" : "")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isActionable(item) && canEscalate ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-gray-200 text-[var(--rakiza-muted)] cursor-not-allowed"}`}>⬆️ تصعيد</button>
          <button type="button" onClick={() => onAction(item, "return")} disabled={!isActionable(item) || !canReturn} title={disabledReason(item) || (!canReturn ? "ليس لديك صلاحية" : "")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${isActionable(item) && canReturn ? "bg-gray-600 text-white hover:bg-gray-700" : "bg-gray-200 text-[var(--rakiza-muted)] cursor-not-allowed"}`}>🔄 عودة للتصحيح</button>
        </div>
      )}
      {reviewable && !isActionable(item) && <p className="mt-2 text-sm text-[var(--rakiza-muted)]">{disabledReason(item)}</p>}
    </div>
  );
}

export default function MyRequestsPage() {
  const [tab, setTab] = useState<"submitted" | "toReview" | "adminApprovals" | "returned" | "disciplinary" | "records">("submitted");
  const [dialog, setDialog] = useState<{ item: Item; action: DecisionAction; rating?: "excellent" | "good" | "acceptable" } | null>(null);
  const [reason, setReason] = useState("");
  const dash = trpc.court.requests.myDashboard.useQuery(undefined, { refetchInterval: 15000 });
  const { permission: permissionSnapshot, roles: rolesSnapshot } = usePermissionsSnapshot();

  const reviewMutation = trpc.court.requests.review.useMutation();
  const escalateMutation = trpc.court.requests.escalate.useMutation();
  const returnMutation = trpc.court.requests.returnForFix.useMutation();

  const roleList: string[] = rolesSnapshot;
  const isOwner = permissionSnapshot === "full_control";
  const isLeadership = isOwner || roleList.includes("court_president") || roleList.includes("assistant_president");
  const isSecretary = roleList.includes("court_secretary");
  const isManager = roleList.some(r => ["department_manager", "trainee_affairs_manager", "human_resources_manager"].includes(r));
  const canApprove = isOwner || isLeadership || isSecretary || isManager;
  const canReject = isOwner || isLeadership || isManager;
  const canEscalate = isOwner || isLeadership || isSecretary || isManager;
  const canReturn = isOwner || isLeadership || isManager;
  const canActOnItem = (item: Item) => !isOwner || item.status === "escalated" || roleList.includes("court_secretary") || roleList.includes("court_president");
  const operationsRoles = ["court_president", "assistant_president", "court_secretary", "human_resources_manager", "department_manager", "performance_monitor", "trainee_affairs_manager"];
  const mayManageOperations = isOwner || roleList.some(r => operationsRoles.includes(r));
  const adminApprovals = trpc.court.approvals.pending.useQuery(undefined, { enabled: mayManageOperations, refetchInterval: 30000 });

  const tabs = [
    { key: "toReview" as const, label: "📥 اعتماداتي" },
    ...(mayManageOperations ? [{ key: "adminApprovals" as const, label: "⚙️ الاعتمادات الإدارية" }] : []),
    { key: "submitted" as const, label: "📤 طلباتي" },
    { key: "returned" as const, label: "↩️ العائد إليّ" },
    { key: "disciplinary" as const, label: "⚠️ مساءلاتي" },
    { key: "records" as const, label: "📋 السجلات" },
  ];

  const FINAL_STATUSES = ["approved", "rejected", "closed", "returned", "saved", "cancelled", "completed"];
  const list = tab === "submitted"
    ? (dash.data?.submitted ?? []).filter((item: Item) => !FINAL_STATUSES.includes(item.status))
    : tab === "records"
      ? [
          ...(dash.data?.submitted ?? []).filter((item: Item) => FINAL_STATUSES.includes(item.status)),
          ...(dash.data?.decided ?? []).filter((item: Item) => FINAL_STATUSES.includes(item.status)),
        ].filter((item: Item) => item.status !== "returned")
      : tab === "adminApprovals"
        ? []
        : (dash.data?.[tab] ?? []);

  const openDialog = (item: Item, action: DecisionAction, rating?: "excellent" | "good" | "acceptable") => {
    setReason("");
    setDialog({ item, action, rating });
  };

  const submitDecision = () => {
    if (!dialog) return;
    const { item, action, rating } = dialog;
    const onSuccess = () => { toast.success("تم تنفيذ الإجراء بنجاح."); setDialog(null); setReason(""); void dash.refetch(); };
    const onError = (error: { message?: string }) => toast.error(error.message || "تعذر تنفيذ الإجراء.");
    if (action === "approve" || action === "reject") {
      reviewMutation.mutate({ requestId: item.id, requestType: item.requestType as "leave" | "permission" | "disciplinary" | "task", decision: action === "approve" ? "approve" : "reject", reason: reason.trim() || undefined, managerRating: action === "approve" ? rating : undefined, ratingNote: action === "approve" ? (reason.trim() || undefined) : undefined }, { onSuccess, onError });
    } else if (action === "escalate") {
      escalateMutation.mutate({ requestId: item.id, requestType: item.requestType as "leave" | "permission" | "disciplinary" | "task", comment: reason.trim() }, { onSuccess, onError });
    } else {
      returnMutation.mutate({ requestId: item.id, requestType: item.requestType as "disciplinary" | "task" | "leave" | "permission", reason: reason.trim() }, { onSuccess, onError });
    }
  };

  const dialogLabels: Record<DecisionAction, { title: string; hint: string; required: boolean }> = {
    approve: { title: "اعتماد الطلب", hint: "ملاحظة اختيارية", required: false },
    reject: { title: "رفض الطلب", hint: "سبب الرفض (إلزامي)", required: true },
    escalate: { title: "تصعيد الطلب", hint: "تعليق التصعيد (إلزامي)", required: true },
    return: { title: "عودة للتصحيح", hint: "سبب العودة (إلزامي)", required: true },
  };

  const ratingLabels: Record<string, string> = { excellent: "🟢 ممتاز", good: "🟡 متوسط", acceptable: "🔴 مقبول" };

  const requireReason = dialog ? dialogLabels[dialog.action].required : false;

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold text-[var(--rakiza-ink)]">طلباتي واعتماداتي</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === t.key ? "bg-[var(--rakiza-olive-strong)] text-white" : "bg-[#eef4f0] text-[var(--rakiza-olive-strong)]"}`}>{t.label}</button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {tab === "adminApprovals" ? (
            <>
              <a href="/approvals" className="inline-block text-sm font-bold text-[var(--rakiza-olive-strong)] underline">فتح صفحة الاعتمادات الإدارية</a>
              {adminApprovals.isLoading ? <p className="text-[var(--rakiza-muted)]">جارٍ التحميل…</p> : (adminApprovals.data ?? []).length ? (adminApprovals.data ?? []).map((approval: any) => (
                <div key={approval.id} className="rounded-xl border border-[var(--rakiza-border)] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded bg-[#eef4f0] px-2 py-0.5 text-xs text-[var(--rakiza-olive-strong)]">{approval.entityType}</span>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{approval.currentRole}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-[var(--rakiza-ink)]">طلب اعتماد #{approval.id}</p>
                  <p className="mt-1 text-xs text-[var(--rakiza-muted)]">{approval.createdAt ? new Date(approval.createdAt).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }) : ""}</p>
                </div>
              )) : <p className="text-[var(--rakiza-muted)]">لا توجد اعتمادات إدارية معلّقة.</p>}
            </>
          ) : dash.isLoading ? <p className="text-[var(--rakiza-muted)]">جارٍ التحميل…</p> : list.length ? list.map((item: Item) => { const actionable = canActOnItem(item); return <Card key={`${item.type}-${item.id}`} item={item} reviewable={tab === "toReview"} canApprove={canApprove && actionable} canReject={canReject && actionable} canEscalate={canEscalate && actionable} canReturn={canReturn && actionable} onAction={openDialog} />; }) : <p className="text-[var(--rakiza-muted)]">لا توجد عناصر في هذا التبويب.</p>}
        </div>
      </section>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-[var(--rakiza-border)] bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-[var(--rakiza-ink)]">{dialog.action === "approve" && dialog.rating ? `اعتماد المهمة (${ratingLabels[dialog.rating]})` : dialogLabels[dialog.action].title}</h2>
            <p className="mt-1 text-xs text-[var(--rakiza-muted)]">{dialog.item.title} — {dialog.item.submitterName}</p>
            <label className="mt-4 block text-xs font-bold text-[var(--rakiza-muted)]">{dialog.action === "approve" && dialog.rating ? "ملاحظة التقييم (اختياري)" : dialogLabels[dialog.action].hint}</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--rakiza-border)] p-2 text-sm" rows={3} maxLength={1000} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold text-[var(--rakiza-muted)]">إلغاء</button>
              <button type="button" onClick={submitDecision} disabled={reviewMutation.isPending || escalateMutation.isPending || returnMutation.isPending || (requireReason && reason.trim().length < 3)} className="rounded-lg bg-[var(--rakiza-olive-strong)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تنفيذ</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
