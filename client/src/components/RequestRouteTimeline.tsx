import { trpc } from "@/lib/trpc";

const stepIcons: Record<string, string> = {
  submitted: "🤖",
  employee_response: "💬",
  manager_review: "👤",
  escalated: "⬆️",
  escalated_secretary: "⬆️",
  escalated_president: "⬆️",
  escalated_owner: "👑",
  decision: "✅",
};

const decisionLabels: Record<string, string> = {
  approved: "معتمد",
  rejected: "مرفوض",
  returned: "مُعاد",
  cancelled: "ملغاة",
};

type RouteStep = {
  step: "submitted" | "employee_response" | "manager_review" | "escalated" | "escalated_secretary" | "escalated_president" | "escalated_owner" | "decision";
  label: string;
  by: string;
  at: string | null;
  status: "done" | "current" | "pending";
  decision?: string | null;
};

function approvalHint(steps: RouteStep[]) {
  const current = steps.find(s => s.status === "current");
  if (!current) {
    const decision = steps.find(s => s.step === "decision" && s.decision);
    return decision ? `تم اتخاذ القرار: ${decisionLabels[decision.decision ?? ""] ?? decision.decision}` : "";
  }
  if (current.step === "employee_response") return "بانتظار جواب الموظف";
  if (current.step === "manager_review") return "بانتظار اعتماد المدير المباشر";
  if (current.step === "escalated" || current.step === "escalated_secretary") return "مصعَّد للأمين";
  if (current.step === "escalated_president") return "مصعَّد للرئيس";
  if (current.step === "escalated_owner") return "مصعَّد للمالك";
  return "قيد المعالجة";
}

export default function RequestRouteTimeline({ requestId, requestType }: { requestId: number; requestType: "leave" | "permission" | "disciplinary" }) {
  const route = trpc.court.requests.route.useQuery({ requestId, requestType }, { enabled: Boolean(requestId) });
  if (!route.data) return null;
  const r = route.data;
  const hint = approvalHint(r.steps as RouteStep[]);
  return (
    <div className="mt-3 rounded-lg border border-[#e7e0d4] bg-[#faf7f0] p-3 text-xs">
      <p className="font-bold text-[#12352f]">مسار الطلب</p>
      <ol className="mt-2 space-y-2">
        {(r.steps as RouteStep[]).map(step => {
          const statusDot = step.status === "done" ? "🟢" : step.status === "current" ? "🔵" : "⚪";
          const statusClass = step.status === "current" ? "text-[#1d5fb8]" : step.status === "done" ? "text-[#2d6b4f]" : "text-[#9a938a]";
          return (
            <li key={`${step.step}-${step.label}`} className="flex items-start gap-2">
              <span className="mt-0.5">{stepIcons[step.step] ?? "•"}</span>
              <div className="flex-1">
                <span className={`font-bold ${statusClass}`}>
                  {statusDot} {step.label}{step.status === "current" ? " (حالياً)" : ""}
                </span>
                {" — "}{step.by}
                {step.at ? <span className="text-[#8a8279]"> · {new Date(step.at).toLocaleDateString("ar-SA")}</span> : null}
                {step.decision ? <span className="text-[#2d6b4f]"> · {decisionLabels[step.decision] ?? step.decision}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {hint && <p className="mt-2 rounded bg-[#f3e5bf] px-2 py-1 text-[#805d27]">{hint}</p>}
    </div>
  );
}

