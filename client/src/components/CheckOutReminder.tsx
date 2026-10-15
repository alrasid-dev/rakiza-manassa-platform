import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Clock3, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** تذكير يومي: قبل إغلاق البصمة (14:49–14:59 الرياض) لمن سجّل دخولاً ولم يخرج. */
export default function CheckOutReminder() {
  const { user } = useAuth({ disabled: false });
  const utils = trpc.useUtils();
  const attendanceApi = (trpc.court as any).attendance;
  const self = (trpc.court as any).people?.self?.useQuery ? (trpc.court as any).people.self.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 30_000, staleTime: 0 }) : { data: null };
  const today = attendanceApi?.today?.useQuery ? attendanceApi.today.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 60_000 }) : { data: null };
  const checkout = attendanceApi?.checkout?.useMutation ? attendanceApi.checkout.useMutation({ onSuccess: () => { void (utils.court as any).attendance?.today.invalidate(); toast.success("تم تسجيل خروجك."); } }) : { mutate: () => undefined, isPending: false };
  const [open, setOpen] = useState(false);

  const attendanceMode = (self.data as { attendanceMode?: string } | null)?.attendanceMode;
  const isRemoteOrMixed = attendanceMode === "remote" || attendanceMode === "mixed";
  const todayData = today.data as { checkInAt?: Date | string | null; checkOutAt?: Date | string | null } | null | undefined;
  const needsCheckout = Boolean(isRemoteOrMixed && todayData?.checkInAt && !todayData?.checkOutAt);

  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const userId = user?.id ?? "anon";
  const remindKey = `rakiza:checkout-reminder:${dateStr}:${userId}`;

  useEffect(() => {
    const check = () => {
      if (!needsCheckout) { setOpen(false); return; }
      if (typeof window !== "undefined" && localStorage.getItem(remindKey) === "true") return;
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Riyadh",
        hour: "2-digit", minute: "2-digit", hour12: false
      }).formatToParts(now);
      const total = Number(parts.find(p => p.type === "hour")?.value ?? 0) * 60
                  + Number(parts.find(p => p.type === "minute")?.value ?? 0);
      const toastKey = `rakiza:checkout-toast-2pm:${dateStr}:${userId}`;

      // إشعار 2م
      if (total >= 14 * 60 && total < 14 * 60 + 1) {
        if (localStorage.getItem(toastKey) !== "true") {
          toast.info("اقترب موعد الخروج، لا تنس تسجيل خروجك");
          localStorage.setItem(toastKey, "true");
        }
      }

      // النافذة (14:49–14:59) — كما هي
      if (total >= 14 * 60 + 49 && total < 14 * 60 + 59) setOpen(true);
      else setOpen(false);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [needsCheckout, remindKey]);

  const dismiss = () => {
    if (typeof window !== "undefined") localStorage.setItem(remindKey, "true");
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="checkout-reminder-title" className="fixed inset-0 z-[70] grid place-items-center bg-[#14251c]/40 p-4">
      <section dir="rtl" className="w-full max-w-md rounded-[1.6rem] bg-[var(--rakiza-surface)] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--rakiza-gold)] text-white"><Clock3 className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-black text-[var(--rakiza-gold)]">تذكير</p>
            <h2 id="checkout-reminder-title" className="text-xl font-black text-[#183d2d]">اقترب وقت إغلاق البصمة ⏰</h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-7 text-[#5f7266]">سجّل خروجك قبل 14:59.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={dismiss} className="rounded-lg border border-[#e3c7b4] px-3 py-2 text-sm font-bold text-[#9a5c33]">لاحقاً</button>
          <button type="button" disabled={checkout.isPending} onClick={() => { checkout.mutate(); setOpen(false); }} className="inline-flex items-center gap-2 rounded-lg bg-[var(--rakiza-olive)] px-3 py-2 text-sm font-black text-white"><LogOut className="h-4 w-4" />{checkout.isPending ? "جارٍ التسجيل…" : "تسجيل الخروج الآن"}</button>
        </div>
      </section>
    </div>
  );
}