import { ArrowRight, KeyRound, Smartphone } from "lucide-react";
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { platformBasePath } from "@/lib/pwa";

const codeOnly = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export default function PasswordRecoveryPage() {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [notice, setNotice] = useState("");
  const requestPhone = (trpc.court.otp as any).requestByPhone?.useMutation?.() ?? { mutateAsync: async () => { throw new Error("خدمة الاستعادة غير متاحة حالياً."); }, isPending: false };
  const requestEmail = trpc.court.otp.request.useMutation();
  const verifyOtp = trpc.court.otp.verify.useMutation();
  const submitPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice("");
    try {
      const result = await requestPhone.mutateAsync({ phone });
      setNotice(`أُرسل رمز لمرة واحدة إلى قناة التنبيه المرتبطة بجوالك. صالح ${Math.round(result.expiresInSeconds / 60)} دقائق.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذر الإرسال."); }
  };
  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice("");
    try {
      const result = await requestEmail.mutateAsync({ officialEmail: email.trim() });
      setCodeRequested(true);
      setCode("");
      setNotice(`أُرسل الرمز إلى بريد التنبيهات الشخصي المرتبط بالحساب. صالح ${Math.round(result.expiresInSeconds / 60)} دقائق. أدخل الرمز أدناه للتحقق.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذر الإرسال."); }
  };
  const submitVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice("");
    try {
      const result = await verifyOtp.mutateAsync({ officialEmail: email.trim(), code });
      if (!result.verified) {
        const message = result.reason === "expired" ? "انتهت صلاحية الرمز (10 دقائق). اطلب رمزاً جديداً." : result.reason === "locked" ? "تجاوزت عدد المحاولات المسموح. اطلب رمزاً جديداً." : "الرمز غير صحيح. تأكد من الأرقام الستة.";
        setNotice(message);
        return;
      }
      window.location.assign(platformBasePath());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر التحقق من الرمز.");
    }
  };
  return (
    <main dir="rtl" className="min-h-screen bg-[#f7f6ef] px-4 py-10" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="mx-auto max-w-lg rounded-[1.7rem] border bg-white p-6 shadow-sm">
        <p className="text-xs font-black text-[#b18448]">استعادة مجانية</p>
        <h1 className="mt-2 text-3xl font-black text-[#12352f]">استعادة الدخول</h1>
        <p className="mt-3 text-sm leading-7 text-[#65766d]">لا حاجة لاشتراك مدفوع. أدخل رقم جوالك المسجّل أو بريدك الرسمي ليصل رمز لمرة واحدة إلى بريد التنبيهات الشخصي، ثم تحقق بالرمز للدخول.</p>

        <form onSubmit={submitPhone} className="mt-6 space-y-3">
          <label className="text-sm font-bold">رقم الجوال<input value={phone} onChange={event => setPhone(event.target.value)} placeholder="05xxxxxxxx" className="mt-2 h-12 w-full rounded-xl border px-3" /></label>
          <button type="submit" disabled={requestPhone.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#006c35] py-3 text-sm font-black text-white"><Smartphone className="h-4 w-4" />{requestPhone.isPending ? "جارٍ الإرسال…" : "إرسال رمز للجوال المرتبط"}</button>
        </form>

        <form onSubmit={submitEmail} className="mt-6 space-y-3 border-t pt-5">
          <label className="text-sm font-bold">البريد الرسمي<input value={email} onChange={event => setEmail(event.target.value)} placeholder="name@moj.gov.sa" className="mt-2 h-12 w-full rounded-xl border px-3" /></label>
          <button type="submit" disabled={requestEmail.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-black">إرسال رمز لبريد التنبيهات <ArrowRight className="h-4 w-4" /></button>
        </form>

        {codeRequested && (
          <form onSubmit={submitVerify} className="mt-5 space-y-3 rounded-2xl border border-[#d9e6dc] bg-[#f5faf6] p-4">
            <label className="text-sm font-bold">رمز التحقق (6 أرقام)<input value={code} onChange={event => setCode(codeOnly(event.target.value))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" dir="ltr" className="mt-2 h-14 w-full rounded-xl border text-center text-2xl tracking-[.45em]" /></label>
            <button type="submit" disabled={verifyOtp.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#006c35] py-3 text-sm font-black text-white"><KeyRound className="h-4 w-4" />{verifyOtp.isPending ? "جارٍ التحقق…" : "تحقق ودخول"}</button>
            <button type="button" onClick={() => { setCodeRequested(false); setNotice(""); }} className="w-full text-center text-xs font-bold text-[#006c35] underline">تغيير البريد</button>
          </form>
        )}

        {notice && <p role="status" className="mt-5 rounded-xl bg-[#edf4ee] p-3 text-sm leading-6">{notice}</p>}
        <a href="/login" className="mt-6 block text-center text-sm font-bold text-[#006c35]">العودة لتسجيل الدخول</a>
      </div>
    </main>
  );
}
