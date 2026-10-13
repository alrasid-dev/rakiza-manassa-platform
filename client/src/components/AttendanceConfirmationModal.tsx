import { CheckCircle2, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type PendingAssignment = { id: number; scheduledAt: string | Date; status: string } | null;

/** نافذة منبثقة عالمية لتأكيد الحضور عند وجود طلب معلّق من مهمة attendance_confirmation. */
export default function AttendanceConfirmationModal() {
  const utils = trpc.useUtils();
  const attendanceApi = (trpc.court as any).attendance;

  const pending = attendanceApi?.pendingAssignment?.useQuery
    ? attendanceApi.pendingAssignment.useQuery(undefined, { refetchInterval: 30_000, staleTime: 0 })
    : { data: null as PendingAssignment };

  const confirm = attendanceApi?.confirmAttendance?.useMutation
    ? attendanceApi.confirmAttendance.useMutation({
        onSuccess: () => {
          void (utils.court as any).attendance?.pendingAssignment?.invalidate?.();
          toast.success("تم تأكيد حضورك.");
        },
        onError: (error: { message?: string }) => toast.error(error?.message || "تعذر تأكيد الحضور."),
      })
    : { mutate: (_input: { assignmentId: number }) => undefined, isPending: false };

  const assignment = (pending.data ?? null) as PendingAssignment;

  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState(false);

  const dateStr = new Date().toLocaleDateString("en-CA");
  const dismissKey = `rakiza:confirmation:dismiss:${dateStr}`;

  const scheduledMs = assignment?.scheduledAt ? new Date(assignment.scheduledAt).getTime() : 0;
  const deadlineMs = scheduledMs + 30 * 60_000;

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(dismissKey) === "true") setDismissed(true);
  }, [dismissKey]);

  useEffect(() => {
    if (!assignment?.id) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [assignment?.id]);

  const show = Boolean(assignment?.id && now >= scheduledMs && now < deadlineMs && !dismissed);

  if (!show) return null;

  const secondsLeft = Math.max(0, Math.floor((deadlineMs - now) / 1000));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  const doConfirm = () => { if (assignment?.id) confirm.mutate({ assignmentId: assignment.id }); };
  const dismiss = () => { if (typeof window !== "undefined") window.localStorage.setItem(dismissKey, "true"); setDismissed(true); };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="attendance-confirmation-title" className="fixed inset-0 z-[75] grid place-items-center bg-[#14251c]/40 p-4">
      <section dir="rtl" className="w-full max-w-md rounded-[1.6rem] bg-[var(--rakiza-surface)] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--rakiza-gold)] text-white"><Clock3 className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-black text-[var(--rakiza-gold)]">تأكيد الحضور</p>
            <h2 id="attendance-confirmation-title" className="text-xl font-black text-[#183d2d]">أكد حضورك الآن</h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-7 text-[#5f7266]">لديك طلب تأكيد حضور معلّق. يرجى التأكيد قبل انتهاء النافذة.</p>
        <p className="mt-2 text-xs font-bold text-[var(--rakiza-gold)]">الوقت المتبقي: {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={dismiss} className="rounded-lg border border-[#e3c7b4] px-3 py-2 text-sm font-bold text-[#9a5c33]">تجاهل</button>
          <button type="button" disabled={confirm.isPending} onClick={doConfirm} className="inline-flex items-center gap-2 rounded-lg bg-[var(--rakiza-olive)] px-3 py-2 text-sm font-black text-white">
            <CheckCircle2 className="h-4 w-4" />{confirm.isPending ? "جارٍ التأكيد…" : "تأكيد الحضور"}
          </button>
        </div>
      </section>
    </div>
  );
}
