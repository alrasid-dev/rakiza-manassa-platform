import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Loader2, Mail } from "lucide-react";
import { useState } from "react";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** نافذة اختيارية تُعرض عند أول دخول ليدخل الموظف بريداً شخصياً للاستعادة والإشعارات (يمكن تخطّيها). */
export function EmailRequiredModal() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const emailSettings = trpc.court.emailSettings.mine.useQuery(undefined, { enabled: isAuthenticated });
  const update = trpc.court.emailSettings.update.useMutation();
  const requestOtp = trpc.court.otp.request.useMutation();
  const verifyOtp = trpc.court.otp.verify.useMutation();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return window.localStorage.getItem("rakiza:email-modal-dismissed") === "1"; } catch { return false; }
  });

  const dismiss = () => {
    try { window.localStorage.setItem("rakiza:email-modal-dismissed", "1"); } catch {}
    setDismissed(true);
  };

  if (emailSettings.isLoading) return null;
  const settings = emailSettings.data;
  if (!settings) return null; // غير مسجّل دخول أو لم تُحمَّل الإعدادات بعد

  const hasVerifiedEmail = Boolean(settings.notificationEmail && settings.notificationEmailVerifiedAt);
  if (hasVerifiedEmail || dismissed) return null;

  const officialEmail = settings.officialEmail ?? "";

  const handleSendOtp = async () => {
    const normalized = email.trim();
    if (!EMAIL_PATTERN.test(normalized)) {
      setError("أدخل بريداً صحيحاً.");
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({ notificationEmail: normalized });
      await requestOtp.mutateAsync({ officialEmail });
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال الرمز.");
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("الرمز 6 أرقام.");
      return;
    }
    setError(null);
    try {
      const result = await verifyOtp.mutateAsync({ officialEmail, code });
      if (!result.verified) {
        setError(
          result.reason === "expired"
            ? "انتهت صلاحية الرمز. اطلب رمزاً جديداً."
            : result.reason === "locked"
              ? "تجاوزت عدد المحاولات. اطلب رمزاً جديداً."
              : "الرمز غير صحيح.",
        );
        return;
      }
      await utils.court.emailSettings.mine.invalidate();
      // ستنغلق تلقائياً لأن الإعدادات ستُحدَّث إلى «بريد موثّق».
    } catch (e) {
      setError(e instanceof Error ? e.message : "الرمز غير صحيح.");
    }
  };

  const busy = update.isPending || requestOtp.isPending || verifyOtp.isPending;

  return (
    <Dialog open onOpenChange={open => { if (!open) dismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4" dir="rtl">
          <div className="text-center">
            <Mail className="mx-auto h-12 w-12 text-[var(--rakiza-gold)]" />
            <h2 className="mt-2 text-lg font-bold">{step === "email" ? "أضف بريدك الشخصي" : "أدخل رمز التحقق"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "email"
                ? "نحتاج بريداً شخصياً (Gmail مثلاً) للاستعادة والإشعارات، لأن البريد الرسمي لا يستقبل الرسائل."
                : `أرسلنا رمزاً مكوّناً من 6 أرقام إلى ${email}`}
            </p>
          </div>

          {step === "email" ? (
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="example@gmail.com"
                value={email}
                onChange={event => setEmail(event.target.value)}
                dir="ltr"
                autoComplete="email"
              />
              <Button onClick={handleSendOtp} disabled={busy} className="w-full">
                {update.isPending || requestOtp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال الرمز"}
              </Button>
              <button
                type="button"
                onClick={dismiss}
                className="w-full text-center text-sm text-muted-foreground hover:underline"
              >
                تخطّي الآن (يمكن إضافته لاحقًا من الإعدادات)
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, ""))}
                dir="ltr"
                className="text-center text-2xl tracking-widest"
              />
              <Button onClick={handleVerify} disabled={busy} className="w-full">
                {verifyOtp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحقق ومتابعة"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="w-full text-center text-sm text-muted-foreground hover:underline"
              >
                تغيير البريد
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
