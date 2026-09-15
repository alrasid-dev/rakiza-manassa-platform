import React, { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { platformBasePath } from "@/lib/pwa";
import { trpc } from "@/lib/trpc";
import { authCreateUserWithEmailAndPassword, authSendEmailVerification, authSignInWithEmailAndPassword, authSignOut, authUpdatePassword } from "@/lib/firebase";
import { PASSWORD_POLICY_HINT, validateLoginPassword, validateNewPassword } from "@shared/password-policy";
import { Button } from "./ui/button";

type Props = {
  officialEmail: string;
  validOfficialEmail: boolean;
  activationToken?: string | null;
  forcePasswordSetup?: boolean;
  onPasswordSetupComplete?: () => void;
};

export function FirebaseAuthPanel({ officialEmail, validOfficialEmail, activationToken, forcePasswordSetup = false, onPasswordSetupComplete }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"signin" | "register" | "change" | null>(null);
  const exchange = (trpc.court as any).firebaseAuth.exchange.useMutation();
  const completePasswordSetup = (trpc.court as any).firebaseAuth.completePasswordSetup?.useMutation?.() ?? { mutateAsync: async () => ({ success: true }), isPending: false };
  const activationMode = Boolean(activationToken) || forcePasswordSetup;

  const firebaseErrorMessage = (error: unknown, fallback: string) => {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "auth/internal-error") return "تعذر إكمال الاتصال بخدمة Firebase. تأكد من تفعيل Email/Password في Firebase Authentication، ثم أعد المحاولة.";
    if (code === "auth/network-request-failed") return "تعذر الاتصال بخدمة Firebase من هذا الجهاز. تحقق من الإنترنت أو جرّب شبكة جوال/نافذة خفية، ثم أعد المحاولة.";
    if (code === "auth/operation-not-allowed") return "طريقة الدخول هذه غير مفعلة في Firebase Authentication حتى الآن.";
    if (code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") return "البريد أو كلمة المرور غير صحيحة، أو لم يتم إنشاء كلمة مرور لهذا البريد بعد.";
    if (code === "auth/email-already-in-use") return "يوجد حساب بكلمة مرور لهذا البريد. استخدم «دخول بالبريد» أو عيّن كلمة مرور جديدة عبر OTP ثم التفعيل.";
    if (code === "auth/popup-blocked") return "المتصفح منع النافذة المنبثقة؛ أعد المحاولة وسيُفتح تسجيل Google في الصفحة نفسها.";
    return error instanceof Error ? error.message : fallback;
  };

  const bridgeSession = async (user: { getIdToken: () => Promise<string> }, options?: { completePasswordSetup?: boolean }) => {
    const idToken = await user.getIdToken();
    const result = await exchange.mutateAsync({ idToken, ...(activationToken ? { activationToken } : {}), ...(options?.completePasswordSetup ? { completePasswordSetup: true } : {}) });
    if (result?.mustChangePassword) {
      setNotice("يلزم تعيين كلمة مرور جديدة قبل متابعة الدخول إلى رَكيزة.");
      onPasswordSetupComplete?.();
      return;
    }
    onPasswordSetupComplete?.();
    window.location.assign(platformBasePath());
  };

  const signInEmail = async () => {
    if (!validOfficialEmail) { setNotice("أدخل البريد الرسمي أولاً."); return; }
    const loginPolicy = validateLoginPassword(password);
    if (!loginPolicy.ok) { setNotice(loginPolicy.message); return; }
    setBusy("signin"); setNotice("");
    try {
      const result = await authSignInWithEmailAndPassword(officialEmail.trim().toLowerCase(), password);
      if (!result.user.emailVerified && !activationMode) { await authSignOut(); setNotice("أكد بريدك الرسمي من الرسالة المرسلة إليه قبل الدخول."); return; }
      await bridgeSession(result.user);
    } catch (error) { setNotice(firebaseErrorMessage(error, "تعذر الدخول بالبريد وكلمة المرور.")); }
    finally { setBusy(null); }
  };

  const registerEmail = async () => {
    if (!validOfficialEmail) { setNotice("أدخل البريد الرسمي أولاً."); return; }
    const newPasswordPolicy = validateNewPassword(password);
    if (!newPasswordPolicy.ok) { setNotice(newPasswordPolicy.message); return; }
    if (activationMode && password !== confirmPassword) { setNotice("تأكيد كلمة المرور غير مطابق."); return; }
    setBusy("register"); setNotice("");
    try {
      const result = await authCreateUserWithEmailAndPassword(officialEmail.trim().toLowerCase(), password);
      if (activationMode) {
        await bridgeSession(result.user, { completePasswordSetup: true });
      } else {
        await authSendEmailVerification(result.user);
        await authSignOut();
        setNotice("تم إنشاء الحساب. افتح رسالة التأكيد في بريدك الرسمي ثم عد للدخول بكلمة المرور.");
      }
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "auth/email-already-in-use" && activationMode) {
        try {
          const signed = await authSignInWithEmailAndPassword(officialEmail.trim().toLowerCase(), password);
          await authUpdatePassword(signed.user, password);
          await completePasswordSetup.mutateAsync();
          await bridgeSession(signed.user, { completePasswordSetup: true });
          return;
        } catch (inner) {
          setNotice(firebaseErrorMessage(inner, "الحساب موجود. استخدم كلمة المرور الحالية أو أعد التعيين عبر OTP."));
          return;
        }
      }
      setNotice(firebaseErrorMessage(error, "تعذر إنشاء حساب البريد."));
    }
    finally { setBusy(null); }
  };

  return <div className="mt-5 space-y-4">
    <div className="flex items-start gap-2">
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#006c35]" />
      <div>
        <p className="text-sm font-bold text-[#29463b]">{activationMode ? "تعيين كلمة مرور خاصة بك" : "كلمة المرور"}</p>
        <p className="mt-1 text-xs leading-6 text-[#718078]">{activationMode ? "أول دخول: اختر كلمة مرور من أحرف وأرقام، وتُعتمد للدخول بعد ذلك دون أي تحقق إضافي." : "أدخل كلمة المرور الخاصة بحسابك الرسمي للدخول."}</p>
      </div>
    </div>
    {Boolean(activationToken) && <p className="rounded-lg bg-[#e9f2ea] p-2 text-xs leading-5 text-[#2f694f]">تم إثبات هويتك. أنشئ كلمة مرورك الآن؛ رمز التفعيل صالح لمرة واحدة.</p>}
    <div>
      <label className="block text-xs font-bold text-[#52665a]" htmlFor="rakiza-login-password">{activationMode ? "كلمة المرور الجديدة" : "كلمة المرور"}</label>
      <input id="rakiza-login-password" aria-label={activationMode ? "كلمة المرور الجديدة" : "كلمة المرور"} value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete={activationMode ? "new-password" : "current-password"} placeholder="8 خانات على الأقل" className="mt-2 h-11 w-full rounded-xl border border-input bg-white px-3 text-sm" />
      <p className="mt-1 text-[11px] leading-5 text-[#718078]">{PASSWORD_POLICY_HINT}</p>
    </div>
    {activationMode && <div>
      <label className="block text-xs font-bold text-[#52665a]" htmlFor="rakiza-login-confirm">تأكيد كلمة المرور</label>
      <input id="rakiza-login-confirm" aria-label="تأكيد كلمة المرور" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="أعد كتابة كلمة المرور" className="mt-2 h-11 w-full rounded-xl border border-input bg-white px-3 text-sm" />
    </div>}
    <Button type="button" className="w-full bg-[#006c35] hover:bg-[#00552b]" disabled={busy !== null || exchange.isPending} onClick={() => void (activationMode ? registerEmail() : signInEmail())}>
      <KeyRound aria-hidden="true" className="ml-2 h-4 w-4" />{busy === "signin" || busy === "register" ? "جارٍ التحقق…" : activationMode ? "حفظ كلمة المرور ومتابعة الدخول" : "دخول"}
    </Button>
    {!activationMode && <button type="button" onClick={() => void registerEmail()} disabled={busy !== null || exchange.isPending} aria-label="أول دخول؟ إنشاء كلمة مرور جديدة" className="w-full text-center text-xs font-bold text-[#006c35] underline disabled:opacity-50">أول دخول؟ أنشئ كلمة مرورك الآن</button>}
    {notice && <p role="status" className="rounded-xl bg-white p-3 text-xs leading-6 text-[#426253]">{notice}</p>}
  </div>;
};
