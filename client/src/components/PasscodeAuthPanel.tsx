import React, { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { platformBasePath } from "@/lib/pwa";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";

type Props = {
  officialEmail: string;
  validOfficialEmail: boolean;
};

/** رمز مرور من 6 أرقام ينشئه الموظف أول مرة ويُدخله في الدخول اليومي. */
export function PasscodeAuthPanel({ officialEmail, validOfficialEmail }: Props) {
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"signin" | "setup" | null>(null);
  const [setupMode, setSetupMode] = useState(false);

  const passcodeApi = trpc.court.passcode;
  const configuredQuery = passcodeApi.isConfigured.useQuery(
    { officialEmail: officialEmail.trim().toLowerCase() },
    { enabled: validOfficialEmail },
  );
  const login = passcodeApi.login.useMutation();
  const setup = passcodeApi.setup.useMutation();

  // أول دخول: إذا تبيّن أن الرمز غير منشأ بعد، يُعرض وضع الإنشاء تلقائياً.
  useEffect(() => {
    if (validOfficialEmail && configuredQuery.data?.configured === false) setSetupMode(true);
  }, [validOfficialEmail, configuredQuery.data?.configured]);

  const normalizedEmail = officialEmail.trim().toLowerCase();
  const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 6);

  const signIn = async () => {
    if (!validOfficialEmail) { setNotice("أدخل بريد الدخول المعتمد: الرسمي أو بريد مالك رَكيزة."); return; }
    if (passcode.length !== 6) { setNotice("أدخل رمز المرور المكوّن من 6 أرقام."); return; }
    setBusy("signin"); setNotice("");
    try {
      await login.mutateAsync({ officialEmail: normalizedEmail, passcode });
      window.location.assign(platformBasePath());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر الدخول برمز المرور.");
      setBusy(null);
    }
  };

  const createPasscode = async () => {
    if (!validOfficialEmail) { setNotice("أدخل بريد الدخول المعتمد: الرسمي أو بريد مالك رَكيزة."); return; }
    if (passcode.length !== 6) { setNotice("أدخل رمز المرور المكوّن من 6 أرقام."); return; }
    if (passcode !== confirmPasscode) { setNotice("تأكيد رمز المرور غير مطابق."); return; }
    setBusy("setup"); setNotice("");
    try {
      await setup.mutateAsync({ officialEmail: normalizedEmail, passcode });
      window.location.assign(platformBasePath());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر إنشاء رمز المرور.");
      setBusy(null);
    }
  };

  return <div className="mt-5 space-y-4">
    <div className="flex items-start gap-2">
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#006c35]" />
      <div>
        <p className="text-sm font-bold text-[#29463b]">{setupMode ? "أنشئ رمز المرور الخاص بك" : "رمز المرور"}</p>
        <p className="mt-1 text-xs leading-6 text-[#718078]">{setupMode ? "أول دخول: اختر رمزاً من 6 أرقام، ويُعتمد للدخول بعد ذلك دون أي تحقق إضافي." : "أدخل رمز المرور المكوّن من 6 أرقام الذي أنشأته أول مرة."}</p>
      </div>
    </div>
    <div>
      <label className="block text-xs font-bold text-[#52665a]" htmlFor="rakiza-login-passcode">{setupMode ? "رمز المرور الجديد" : "رمز المرور"}</label>
      <input id="rakiza-login-passcode" aria-label={setupMode ? "رمز المرور الجديد" : "رمز المرور"} value={passcode} onChange={event => setPasscode(digitsOnly(event.target.value))} type="password" inputMode="numeric" autoComplete={setupMode ? "new-password" : "one-time-code"} placeholder="••••••" dir="ltr" className="mt-2 h-12 w-full rounded-xl border border-input bg-white px-3 text-center text-2xl tracking-[.45em]" />
    </div>
    {setupMode && <div>
      <label className="block text-xs font-bold text-[#52665a]" htmlFor="rakiza-login-passcode-confirm">تأكيد رمز المرور</label>
      <input id="rakiza-login-passcode-confirm" aria-label="تأكيد رمز المرور" value={confirmPasscode} onChange={event => setConfirmPasscode(digitsOnly(event.target.value))} type="password" inputMode="numeric" autoComplete="new-password" placeholder="••••••" dir="ltr" className="mt-2 h-12 w-full rounded-xl border border-input bg-white px-3 text-center text-2xl tracking-[.45em]" />
    </div>}
    <Button type="button" className="w-full bg-[#006c35] hover:bg-[#00552b]" disabled={busy !== null || login.isPending || setup.isPending} onClick={() => void (setupMode ? createPasscode() : signIn())}>
      <KeyRound aria-hidden="true" className="ml-2 h-4 w-4" />{busy === "signin" || busy === "setup" ? "جارٍ التحقق…" : setupMode ? "حفظ الرمز ومتابعة الدخول" : "دخول"}
    </Button>
    {!setupMode && <button type="button" onClick={() => { setNotice(""); setPasscode(""); setConfirmPasscode(""); setSetupMode(true); }} disabled={busy !== null || login.isPending} aria-label="أول دخول؟ أنشئ رمز المرور الآن" className="w-full text-center text-xs font-bold text-[#006c35] underline disabled:opacity-50">أول دخول؟ أنشئ رمز المرور الآن</button>}
    {setupMode && <button type="button" onClick={() => { setNotice(""); setConfirmPasscode(""); setSetupMode(false); }} disabled={busy !== null || setup.isPending} aria-label="رجوع إلى الدخول برمز المرور" className="w-full text-center text-xs font-bold text-[#006c35] underline disabled:opacity-50">لديّ رمز مرور؟ ادخل به</button>}
    {notice && <p role="status" className="rounded-xl bg-white p-3 text-xs leading-6 text-[#426253]">{notice}</p>}
  </div>;
}
