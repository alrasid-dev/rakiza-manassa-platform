import { Fingerprint } from "lucide-react";
import React from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function PasskeyEnrollmentGate({ officialEmail }: { officialEmail?: string | null }) {
  const passkeyApi = (trpc.court as any).passkey;
  const status = passkeyApi?.enrollmentStatus?.useQuery ? passkeyApi.enrollmentStatus.useQuery(undefined, { enabled: Boolean(officialEmail) }) : { data: { enrolled: true }, isLoading: false };
  const begin = passkeyApi?.beginRegistration?.useMutation ? passkeyApi.beginRegistration.useMutation() : { mutateAsync: async () => { throw new Error("تسجيل البصمة غير متاح حالياً."); } };
  const finish = passkeyApi?.finishRegistration?.useMutation ? passkeyApi.finishRegistration.useMutation() : { mutateAsync: async () => ({ verified: false }) };
  if (!officialEmail || status.isLoading || status.data?.enrolled !== false) return null;
  const enroll = async () => {
    try {
      if (!("PublicKeyCredential" in window) || !window.isSecureContext) {
        toast.error("يتطلب تسجيل البصمة متصفحاً آمناً (HTTPS).");
        return;
      }
      const options = await begin.mutateAsync({ officialEmail });
      const response = await startRegistration({ optionsJSON: options });
      const result = await finish.mutateAsync({ officialEmail, response });
      if (result.verified) {
        toast.success("تم تسجيل البصمة. من الآن الدخول الأساسي من هذا الجهاز بالبصمة.");
        window.location.reload();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل البصمة.");
    }
  };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="passkey-gate-title" className="fixed inset-0 z-[70] grid place-items-center bg-[#14251c]/50 p-4">
      <section dir="rtl" className="w-full max-w-md rounded-[1.6rem] bg-[var(--rakiza-surface)] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--rakiza-olive)] text-white"><Fingerprint className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-black text-[#4a785a]">بعد التسجيل الأول</p>
            <h2 id="passkey-gate-title" className="text-xl font-black text-[#183d2d]">سجّل بصمة هذا الجهاز</h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-7 text-[#5f7266]">الدخول التالي يكون بالبصمة أو Face ID على هذا الجهاز. لا تُرسل بيانات البصمة إلى المنصة، وتبقى داخل جهازك فقط.</p>
        <button type="button" onClick={() => void enroll()} className="mt-5 w-full rounded-xl bg-[var(--rakiza-olive)] py-3 text-sm font-black text-white">تسجيل البصمة الآن</button>
      </section>
    </div>
  );
}
