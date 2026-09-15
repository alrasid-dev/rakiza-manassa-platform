import React, { useEffect, useState } from "react";
import { Chrome } from "lucide-react";
import { platformBasePath } from "@/lib/pwa";
import { trpc } from "@/lib/trpc";
import { authGetRedirectResult, authSignInWithPopup, authSignInWithRedirect, authSignOut } from "@/lib/firebase";
import { Button } from "./ui/button";

/** البريد الاستثنائي الوحيد المسموح خارج نطاق @moj.gov.sa. */
export const PLATFORM_OWNER_EMAIL = "rakizaplatform@gmail.com";

/**
 * دخول مالك المنصة: عبر Google فقط، وبالبريد الاستثنائي وحده.
 * لا يقبل كلمة مرور تقليدية ولا أي بريد آخر، ويُغلق الجلسة فوراً إن اختلف البريد.
 */
export function OwnerGoogleLogin({ onNotice }: { onNotice?: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const exchange = (trpc.court as any).firebaseAuth.exchange.useMutation();

  const report = (message: string) => {
    setNotice(message);
    onNotice?.(message);
  };

  const firebaseErrorMessage = (error: unknown) => {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") return "سيُفتح Google في الصفحة نفسها لإكمال الدخول.";
    if (code === "auth/network-request-failed") return "تعذر الاتصال بخدمة الدخول من هذا الجهاز. تحقق من الإنترنت ثم أعد المحاولة.";
    if (code === "auth/internal-error" || code === "auth/operation-not-allowed") return "دخول Google غير مهيأ حالياً في إعدادات المنصة.";
    return error instanceof Error ? error.message : "تعذر إكمال الدخول عبر Google.";
  };

  const completeOwnerSignIn = async (user: { email?: string | null; getIdToken: () => Promise<string> }) => {
    const email = (user.email ?? "").trim().toLowerCase();
    if (email !== PLATFORM_OWNER_EMAIL) {
      await authSignOut();
      report("هذا المسار مخصص لبريد مالك المنصة فقط. سجّل الدخول بحسابك الرسمي من شاشة الدخول.");
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const result = await exchange.mutateAsync({ idToken });
      if (result?.mustChangePassword) {
        report("تعذّر إكمال دخول المالك لأن الحساب يطلب تعيين كلمة مرور. راجع إعدادات الحساب.");
        return;
      }
      window.location.assign(platformBasePath());
    } catch (error) {
      report(error instanceof Error ? error.message : "تعذر ربط جلسة المالك بخادم رَكيزة.");
    }
  };

  useEffect(() => {
    void authGetRedirectResult()
      .then(result => (result ? completeOwnerSignIn(result.user) : undefined))
      .catch(error => report(firebaseErrorMessage(error)));
    // يُنفَّذ مرة واحدة عند التحميل لإكمال الدخول العائد من Google.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInOwner = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await authSignInWithPopup();
      await completeOwnerSignIn(result.user);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (["auth/popup-blocked", "auth/popup-closed-by-user", "auth/internal-error"].includes(code)) {
        report("سيُفتح Google في الصفحة نفسها لإكمال الدخول.");
        try {
          await authSignInWithRedirect();
          return;
        } catch (redirectError) {
          report(firebaseErrorMessage(redirectError));
          return;
        }
      }
      report(firebaseErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return <div className="mt-6 rounded-2xl border border-[#d9e5d9] bg-[#f7faf5] p-5">
    <p className="text-sm font-bold text-[#29463b]">الدخول عبر حساب Google الخاص بالمالك</p>
    <p className="mt-2 text-xs leading-6 text-[#718078]">هذا المسار لبريد مالك المنصة <span dir="ltr" className="font-bold">{PLATFORM_OWNER_EMAIL}</span> وحده، دون كلمة مرور تقليدية. أي حساب آخر يُرفض ويُغلق فوراً.</p>
    <Button type="button" onClick={() => void signInOwner()} disabled={busy} aria-label="الدخول عبر Google بحساب مالك المنصة" className="mt-4 w-full bg-white text-[#29463b] shadow-sm hover:bg-[#f3f6f0]" variant="outline">
      <Chrome aria-hidden="true" className="ml-2 h-4 w-4" />{busy ? "جارٍ فتح Google…" : "الدخول عبر Google"}
    </Button>
    {notice && <p role="status" className="mt-3 rounded-xl bg-white p-3 text-xs leading-6 text-[#426253]">{notice}</p>}
  </div>;
}
