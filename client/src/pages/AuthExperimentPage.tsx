import React, { useEffect, useMemo, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Headset, ShieldCheck, UserPlus, UserRoundCog } from "lucide-react";
import { OwnerGoogleLogin, PLATFORM_OWNER_EMAIL } from "@/components/OwnerGoogleLogin";
import { PasscodeAuthPanel } from "@/components/PasscodeAuthPanel";
import { PwaInstallHint } from "@/components/PwaInstallHint";
import { platformBasePath, platformHref } from "@/lib/pwa";
import { STATIC_HOST_LOGIN_MESSAGE, isPublicStaticHost, operationalLoginHref } from "@/lib/runtime";
import { trpc } from "@/lib/trpc";

const LAST_EMAIL_KEY = "rakiza:last-official-email";
const MOJ_EMAIL_PATTERN = /^[^@\s]+@moj\.gov\.sa$/i;

export function AuthExperimentPage() {
  const [mode, setMode] = useState<"employee" | "owner">("employee");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [passkeyNotice, setPasskeyNotice] = useState("");
  const validLoginEmail = useMemo(() => MOJ_EMAIL_PATTERN.test(email.trim()), [email]);
  const passkeySupported = typeof window !== "undefined" && "PublicKeyCredential" in window && window.isSecureContext;

  const beginRegistrationMutation = trpc.court.passkey.beginRegistration.useMutation();
  const finishRegistrationMutation = trpc.court.passkey.finishRegistration.useMutation();
  const beginAuthenticationMutation = trpc.court.passkey.beginAuthentication.useMutation();
  const finishAuthenticationMutation = trpc.court.passkey.finishAuthentication.useMutation();

  useEffect(() => {
    const stored = window.localStorage.getItem(LAST_EMAIL_KEY);
    if (stored) setEmail(stored);
  }, []);

  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (MOJ_EMAIL_PATTERN.test(trimmed) || trimmed === PLATFORM_OWNER_EMAIL) window.localStorage.setItem(LAST_EMAIL_KEY, trimmed);
  }, [email]);

  const passkeyErrorMessage = (error: unknown, action: "register" | "authenticate") => {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError") return "تم إلغاء نافذة البصمة أو لم يكتمل التحقق. اضغط الزر مرة أخرى واترك نافذة الجهاز مفتوحة حتى النهاية.";
    if (name === "InvalidStateError") return "البصمة مسجلة مسبقاً على هذا الجهاز. استخدم «الدخول بالبصمة» مباشرة.";
    if (name === "SecurityError") return "رفض المتصفح العملية لأن الرابط غير آمن. افتح رابط رَكيزة الرسمي عبر HTTPS.";
    if (name === "ConstraintError") return "يوجد تعارض في بصمة هذا الحساب على الجهاز. جرّب متصفحاً أو جهازاً آخر.";
    const message = error instanceof Error ? error.message : "";
    if (/UNAUTHORIZED|غير مصرح/i.test(message)) return "تفعيل البصمة يتم بعد أول دخول برمز المرور: سجّل دخولك ثم اضغط الزر مرة أخرى.";
    if (/ملف موظف|بريد رسمي/i.test(message)) return "لا يوجد حساب مسجَّل بهذا البريد بعد. أكمل أول دخول برمز المرور ثم فعّل البصمة.";
    return message || (action === "register" ? "تعذر تفعيل البصمة على هذا الجهاز." : "لا توجد بصمة مسجّلة لهذا الحساب على هذا الجهاز. فعّلها بعد الدخول برمز المرور.");
  };

  const enrollPasskey = async () => {
    setPasskeyNotice("");
    if (!validLoginEmail) { setPasskeyNotice("أدخل بريدك الرسمي المنتهي بـ @moj.gov.sa أولاً، ثم اضغط الزر مرة أخرى."); return; }
    if (!passkeySupported) { setPasskeyNotice("هذا المتصفح أو الرابط لا يدعم البصمة. افتح رابط رَكيزة الرسمي عبر HTTPS."); return; }
    try {
      const options = await beginRegistrationMutation.mutateAsync({ officialEmail: email.trim() });
      const response = await startRegistration({ optionsJSON: options });
      const result = await finishRegistrationMutation.mutateAsync({ officialEmail: email.trim(), response });
      if (result?.verified) setPasskeyNotice("تم تفعيل الدخول بالبصمة على هذا الجهاز. يمكنك الآن الدخول بالبصمة دون كلمة مرور.");
    } catch (error) {
      setPasskeyNotice(passkeyErrorMessage(error, "register"));
    }
  };

  const signInWithPasskey = async () => {
    setPasskeyNotice("");
    if (!validLoginEmail) { setPasskeyNotice("أدخل بريدك الرسمي المنتهي بـ @moj.gov.sa أولاً، ثم اضغط الزر مرة أخرى."); return; }
    if (!passkeySupported) { setPasskeyNotice("هذا المتصفح أو الرابط لا يدعم البصمة. افتح رابط رَكيزة الرسمي عبر HTTPS."); return; }
    try {
      const options = await beginAuthenticationMutation.mutateAsync({ officialEmail: email.trim() });
      const response = await startAuthentication({ optionsJSON: options });
      const result = await finishAuthenticationMutation.mutateAsync({ officialEmail: email.trim(), response });
      if (result?.verified) { window.location.assign(platformBasePath()); return; }
      setPasskeyNotice(result?.reason === "expired" ? "انتهت جلسة التحقق. أعد المحاولة." : "لا توجد بصمة مسجّلة لهذا الحساب على هذا الجهاز. سجّل دخولك بكلمة المرور ثم فعّل البصمة.");
    } catch (error) {
      setPasskeyNotice(passkeyErrorMessage(error, "authenticate"));
    }
  };

  const openOwnerLogin = () => { setMode("owner"); setNotice(""); setPasskeyNotice(""); };
  const openEmployeeLogin = () => { setMode("employee"); setNotice(""); setPasskeyNotice(""); };

  return <main dir="rtl" className="rakiza-theme-root relative min-h-screen bg-[#f7f6ef] px-4 py-7 text-[#243a32] sm:px-8" style={{ fontFamily: "Tajawal, sans-serif" }}>
    <div className="mx-auto max-w-3xl">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[.16em] text-[#b18448]">رَكيزة · دخول مستقل</p>
          <h1 className="mt-2 text-3xl font-black text-[#12352f] sm:text-4xl">{mode === "owner" ? "دخول المالك" : "الدخول إلى رَكيزة"}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#6c7b73]">
            {mode === "owner"
              ? "مسار مخصص لبريد مالك المنصة الاستثنائي، عبر حساب Google فقط ودون كلمة مرور تقليدية."
              : "الدخول بالبريد الرسمي المنتهي بـ @moj.gov.sa ورمز المرور فقط. أول دخول: أنشئ رمزاً من 6 أرقام ويُعتمد للدخول بعد ذلك."}
          </p>
        </div>
        <ShieldCheck aria-hidden="true" className="h-11 w-11 shrink-0 text-[#006c35]" />
      </header>

      {isPublicStaticHost() && <p role="status" className="mt-5 rounded-2xl border border-[#ecdcb9] bg-[#fffaf0] px-4 py-3 text-sm leading-7 text-[#746445]">{STATIC_HOST_LOGIN_MESSAGE}{operationalLoginHref() ? <> <a className="font-black text-[#006c35] underline" href={operationalLoginHref()}>افتح رابط التشغيل</a></> : null}</p>}
      <div className="mt-6"><PwaInstallHint alwaysVisible /></div>

      <section className="mt-6 rounded-[1.7rem] border border-[#e7e0d4] bg-white p-6 shadow-[0_15px_40px_rgba(30,51,42,.06)] sm:p-8">
        {mode === "owner"
          ? <OwnerGoogleLogin onNotice={setNotice} />
          : <>
            <div>
              <label className="block text-xs font-bold text-[#52665a]" htmlFor="rakiza-login-email">البريد الإلكتروني الرسمي</label>
              <input id="rakiza-login-email" aria-label="البريد الإلكتروني الرسمي" value={email} onChange={event => setEmail(event.target.value)} type="email" dir="ltr" inputMode="email" autoComplete="username" placeholder="name@moj.gov.sa" className="mt-2 h-11 w-full rounded-xl border border-input px-3 text-sm" />
              {email.trim().length > 0 && !validLoginEmail && <p role="alert" className="mt-2 text-xs font-bold text-[#9a4634]">لا يُقبل إلا بريد رسمي من نطاق moj.gov.sa.</p>}
            </div>
            <PasscodeAuthPanel officialEmail={email.trim()} validOfficialEmail={validLoginEmail} />
          </>}

        {notice && <p role="status" className="mt-4 rounded-xl bg-[#f3f6f1] p-3 text-xs leading-6 text-[#426253]">{notice}</p>}

        {mode === "owner" && <button type="button" onClick={openEmployeeLogin} aria-label="رجوع إلى دخول الموظفين" className="mt-4 w-full text-center text-xs font-bold text-[#006c35] underline">رجوع إلى دخول الموظفين</button>}
      </section>

      {mode === "employee" && <section className="mt-6 rounded-[1.7rem] border border-[#e2dccd] bg-[#fbf9f4] p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Fingerprint aria-hidden="true" className="h-5 w-5 text-[#006c35]" />
          <h2 className="text-sm font-black text-[#29463b]">تسجيل الدخول بالبصمة</h2>
        </div>
        <p className="mt-2 text-xs leading-6 text-[#718078]">بصمة جهازك تبقى داخل جهازك ولا تُرسل إلى المنصة. فعّل البصمة بعد أول دخول برمز المرور، ثم ادخل بها مباشرة.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => void enrollPasskey()} aria-label="تفعيل الدخول بالبصمة على هذا الجهاز" className="rounded-xl bg-[#006c35] px-4 py-3 text-xs font-black text-white shadow-sm transition hover:bg-[#00552b]">تفعيل البصمة على هذا الجهاز</button>
          <button type="button" onClick={() => void signInWithPasskey()} aria-label="الدخول بالبصمة المسجلة على هذا الجهاز" className="rounded-xl border border-[#bfd3c2] bg-white px-4 py-3 text-xs font-black text-[#246047] transition hover:bg-[#edf6ee]">الدخول بالبصمة</button>
        </div>
        {passkeyNotice && <p role="status" className="mt-3 rounded-xl bg-white p-3 text-xs leading-6 text-[#426253]">{passkeyNotice}</p>}
      </section>}
    </div>

    <nav aria-label="اختصارات الدخول" className="fixed bottom-4 left-4 z-20 flex flex-col gap-2 sm:bottom-6 sm:left-6">
      <button type="button" onClick={openOwnerLogin} className="flex items-center gap-2 rounded-2xl border border-[#d9e5d9] bg-white/95 px-3 py-2 text-xs font-black text-[#12352f] shadow-lg backdrop-blur hover:border-[#006c35]" title="دخول المالك" aria-label="دخول المالك"><UserRoundCog aria-hidden="true" className="h-4 w-4 text-[#006c35]" /><span>دخول المالك</span></button>
      <a href={platformHref("register")} className="flex items-center gap-2 rounded-2xl border border-[#d9e5d9] bg-white/95 px-3 py-2 text-xs font-black text-[#12352f] shadow-lg backdrop-blur hover:border-[#006c35]" title="تسجيل موظف جديد"><UserPlus aria-hidden="true" className="h-4 w-4 text-[#006c35]" /><span>تسجيل موظف جديد</span></a>
      <a href={platformHref("guide")} className="flex items-center gap-2 rounded-2xl border border-[#d9e5d9] bg-white/95 px-3 py-2 text-xs font-black text-[#12352f] shadow-lg backdrop-blur hover:border-[#006c35]" title="الحصول على المساعدة"><Headset aria-hidden="true" className="h-4 w-4 text-[#006c35]" /><span>الحصول على المساعدة</span></a>
    </nav>
  </main>;
}
