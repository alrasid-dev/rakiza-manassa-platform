import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import React, { useEffect, useState } from "react";
import { MailCheck, ShieldCheck, Volume2, VolumeX } from "lucide-react";

type EmailChannelPreference = "work" | "backup" | "both" | "none";

const EMAIL_CHANNEL_OPTIONS: ReadonlyArray<{ value: EmailChannelPreference; label: string; hint: string }> = [
  { value: "none", label: "بدون بريد", hint: "لن تستقبل إشعارات بريدية؛ تبقى إشعارات المنصة الداخلية والفورية." },
  { value: "work", label: "البريد الرسمي فقط", hint: "كل التنبيهات تُرسل إلى بريدك الرسمي @moj.gov.sa." },
  { value: "backup", label: "البريد الإضافي فقط", hint: "يُستخدم البريد الإضافي بعد توثيقه، وإلا يعود النظام تلقائياً للبريد الرسمي." },
  { value: "both", label: "البريدان معاً", hint: "نسخة لكل بريد بعد توثيق البريد الإضافي." },
];

export function EmailSettingsPage() {
  const settings = trpc.court.emailSettings.mine.useQuery();
  const update = trpc.court.emailSettings.update.useMutation({ onSuccess: () => settings.refetch() });
  const [notificationEmail, setNotificationEmail] = useState("");
  const [notificationPreference, setNotificationPreference] = useState<EmailChannelPreference>("none");
  const [recommendationSoundEnabled, setRecommendationSoundEnabled] = useState(true);

  useEffect(() => {
    if (settings.data) {
      setNotificationEmail(settings.data.notificationEmail ?? "");
      setNotificationPreference(settings.data.notificationPreference ?? "none");
    }
    setRecommendationSoundEnabled(window.localStorage.getItem("rakiza:recommendation-sound") !== "off");
  }, [settings.data]);

  const toggleRecommendationSound = () => {
    const next = !recommendationSoundEnabled;
    setRecommendationSoundEnabled(next);
    window.localStorage.setItem("rakiza:recommendation-sound", next ? "on" : "off");
  };

  return <DashboardLayout><section dir="rtl" className="mx-auto max-w-3xl">
    <div className="rounded-[1.7rem] bg-[var(--rakiza-olive-strong)] p-7 text-white shadow-[0_20px_45px_rgba(18,53,47,.18)]">
      <p className="text-xs font-bold tracking-[.14em] text-[#f0cc76]">هوية الحساب وقناة التنبيه</p>
      <h1 className="mt-3 text-3xl font-bold">البريد الرسمي وبريد الإشعارات</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-[#d8e2d8]">البريد الرسمي هو رقمك التعريفي الثابت داخل رَكيزة، أما البريد الإضافي فهو القناة التي تستقبل رمز OTP وتنبيهات المهام والحضور.</p>
    </div>
    <div className="mt-6 rounded-[1.7rem] border border-[var(--rakiza-border)] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3"><MailCheck className="h-6 w-6 text-[var(--rakiza-olive-strong)]" /><div><h2 className="font-bold text-[var(--rakiza-ink)]">المعرّف الرسمي</h2><p className="text-sm text-[var(--rakiza-muted)]">لا يمكن تغييره من هذه الشاشة ولا يستخدم كمعرّف بديل.</p></div></div>
      <div className="mt-4 rounded-xl bg-[#f3f6f1] px-4 py-3 font-semibold text-[var(--rakiza-ink)]">{settings.data?.officialEmail ?? "غير مثبت بعد"}</div>
      {settings.data && !settings.data.officialEmailIsValid && <p className="mt-3 text-sm text-[var(--rakiza-danger)]">يلزم تثبيت بريد رسمي من نطاق moj.gov.sa.</p>}
      <div className="mt-7 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[var(--rakiza-gold)]" /><h2 className="font-bold text-[var(--rakiza-ink)]">بريد الإشعارات</h2></div>
      <label className="mt-4 block text-sm font-bold text-[#385449]">البريد الذي يستقبل OTP والتنبيهات<input type="email" value={notificationEmail} onChange={e => setNotificationEmail(e.target.value)} placeholder="alerts@example.com" className="mt-2 h-11 w-full rounded-xl border border-input px-3 text-sm" /></label>
      <p className="mt-2 text-xs leading-5 text-[#78867e]">بعد تغييره، اطلب رمز دخول جديداً لتأكيد ملكيتك للبريد. لا يظهر هذا البريد في البحث أو المراسلات الداخلية.</p>
      <p className={`mt-3 rounded-xl p-3 text-sm ${settings.data?.notificationEmailVerifiedAt ? "bg-[#e9f2ea] text-[#2f694f]" : "bg-[#fff8e8] text-[var(--rakiza-gold)]"}`}>{settings.data?.notificationEmailVerifiedAt ? "بريد الإشعارات موثق ويستقبل التنبيهات." : "بريد الإشعارات غير موثق بعد؛ سيُوثق عند نجاح أول OTP."}</p>
      <div className="mt-7 border-t border-[var(--rakiza-border)] pt-6">
        <h2 className="font-bold text-[var(--rakiza-ink)]">قناة إرسال التنبيهات</h2>
        <p className="mt-2 text-xs leading-5 text-[#78867e]">اختر البريد الذي تستقبل فيه تنبيهات المهام والحضور والمراسلات المرسلة من المنصة.</p>
        {!settings.data?.notificationEmail && <p className="mt-3 rounded-xl bg-[#fff8e8] p-3 text-xs leading-5 text-[var(--rakiza-gold)]">أضف بريداً إضافياً واحفظه أولاً لتفعيل خيارَي «البريد الإضافي فقط» و«البريدان معاً».</p>}
        <div role="radiogroup" aria-label="قناة إرسال التنبيهات" className="mt-4 grid gap-2 sm:grid-cols-3">
          {EMAIL_CHANNEL_OPTIONS.map(option => {
            const disabled = option.value !== "work" && option.value !== "none" && !settings.data?.notificationEmail;
            const selected = notificationPreference === option.value;
            return <button key={option.value} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => setNotificationPreference(option.value)} className={`rounded-xl border px-3 py-3 text-right transition ${selected ? "border-[var(--rakiza-olive-strong)] bg-[#e9f2ea] ring-2 ring-[#006c35]/20" : "border-[var(--rakiza-border)] bg-[var(--rakiza-surface)] hover:bg-[#eef5ec]"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
              <span className="block text-xs font-black text-[var(--rakiza-ink)]">{option.label}</span>
              <span className="mt-1 block text-[11px] leading-5 text-[var(--rakiza-muted)]">{option.hint}</span>
            </button>;
          })}
        </div>
      </div>
      <Button className="mt-6 bg-[var(--rakiza-olive-strong)] hover:bg-[var(--rakiza-olive-strong)]" disabled={update.isPending || !settings.data?.officialEmailIsValid} onClick={() => update.mutate({ notificationEmail: notificationEmail.trim() || null, notificationPreference })}>{update.isPending ? "جارٍ الحفظ…" : "حفظ بريد الإشعارات"}</Button>
      {update.error && <p role="alert" className="mt-3 text-sm text-[var(--rakiza-danger)]">{update.error.message}</p>}
      {update.isSuccess && <p className="mt-3 text-sm font-bold text-[#2f7351]">تم حفظ بريد الإشعارات. استخدم OTP القادم لتوثيقه.</p>}
      <div className="mt-8 border-t border-[var(--rakiza-border)] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${recommendationSoundEnabled ? "bg-[#e9f2ea] text-[#2f7351]" : "bg-[#fbece7] text-[var(--rakiza-danger)]"}`}>{recommendationSoundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</span><div><h2 className="font-bold text-[var(--rakiza-ink)]">نغمة توصيات الإنجاز</h2><p className="mt-1 text-xs leading-5 text-[var(--rakiza-muted)]">يتحكم هذا الخيار في النغمة القصيرة فقط، بينما تبقى رسالة Toast المرئية مفعلة.</p></div></div>
          <button type="button" role="switch" aria-checked={recommendationSoundEnabled} onClick={toggleRecommendationSound} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${recommendationSoundEnabled ? "bg-[var(--rakiza-olive-strong)] text-white" : "border border-[#d9d0c3] bg-white text-[#7c4d3f]"}`}>{recommendationSoundEnabled ? "النغمة مفعلة" : "النغمة مكتومة"}</button>
        </div>
      </div>
    </div>
  </section></DashboardLayout>;
}
