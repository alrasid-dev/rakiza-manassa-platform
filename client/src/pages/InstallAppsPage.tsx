import React from "react";
import { Download, MonitorSmartphone, Share, Smartphone, TabletSmartphone } from "lucide-react";
import { PwaInstallHint } from "@/components/PwaInstallHint";
import { ANDROID_APK_URL, platformHref } from "@/lib/pwa";
import CourtEmblem from "@/components/CourtEmblem";

const steps = [
  {
    icon: MonitorSmartphone,
    title: "ويندوز وماك ولينكس",
    text: "افتح رَكيزة من كروم أو إيدج، ثم اضغط أيقونة التثبيت في شريط العنوان أو من قائمة المتصفح «تثبيت رَكيزة». تفتح المنصة كنافذة مستقلة.",
  },
  {
    icon: Smartphone,
    title: "أندرويد",
    text: "من كروم: القائمة ⋮ ثم «تثبيت التطبيق». أو حمّل ملف أندرويد المجاني بالأسفل وثبّته مباشرة دون متجر.",
  },
  {
    icon: TabletSmartphone,
    title: "آيفون وآيباد",
    text: "افتح الرابط من سفاري فقط، اضغط زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية». تظهر رَكيزة كتطبيق مجاني دون آب ستور.",
  },
];

export function InstallAppsPage() {
  return (
    <main dir="rtl" className="rakiza-theme-root min-h-screen bg-[#f7f6ef] px-4 py-8 text-[#243a32] sm:px-8" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="mx-auto max-w-3xl">
        <header className="rounded-[1.7rem] border border-[var(--rakiza-border)] bg-white p-6 shadow-[0_15px_40px_rgba(30,51,42,.06)] sm:p-8">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#edf4ee] text-[var(--rakiza-olive-strong)]">
            <CourtEmblem className="h-8 w-8" />
          </div>
          <p className="mt-5 text-xs font-bold tracking-[.16em] text-[var(--rakiza-gold)]">رَكيزة · كل الأجهزة</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--rakiza-ink)] sm:text-4xl">ثبّت المنصة كتطبيق</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#6c7b73]">صفحة الويب نفسها تصبح تطبيقاً على الجوال والآيباد واللابتوب. التثبيت مجاني، والحساب والصلاحيات لا تتغير.</p>
          <div className="mt-5">
            <PwaInstallHint alwaysVisible />
          </div>
        </header>

        <div className="mt-6 grid gap-4">
          {steps.map(step => (
            <article key={step.title} className="rounded-[1.4rem] border border-[#e8e2d7] bg-white p-5 shadow-[0_8px_22px_rgba(30,51,42,0.04)]">
              <step.icon className="h-5 w-5 text-[var(--rakiza-olive-strong)]" aria-hidden="true" />
              <h2 className="mt-3 font-black text-[#1c4435]">{step.title}</h2>
              <p className="mt-2 text-sm leading-7 text-[#68796f]">{step.text}</p>
            </article>
          ))}
        </div>

        <section className="mt-6 rounded-[1.5rem] border border-[#dce8dc] bg-[#f1f7f0] p-6">
          <div className="flex items-center gap-2 text-[#17483a]">
            <Download className="h-5 w-5" aria-hidden="true" />
            <h2 className="font-black">تحميل أندرويد المجاني</h2>
          </div>
          <p className="mt-2 text-sm leading-7 text-[#52665a]">ملف APK يُبنى تلقائياً من المستودع ويُنزَّل دون حساب متجر. عند أول تثبيت اسمح بالمصادر غير المعروفة لهذا الملف فقط.</p>
          <a href={ANDROID_APK_URL} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--rakiza-olive-strong)] px-4 py-2.5 text-sm font-black text-white hover:bg-[var(--rakiza-olive-strong)]">
            <Download className="h-4 w-4" aria-hidden="true" />
            تنزيل تطبيق أندرويد
          </a>
        </section>

        <section className="mt-4 rounded-[1.5rem] border border-[var(--rakiza-border)] bg-white p-6">
          <div className="flex items-center gap-2 text-[#17483a]">
            <Share className="h-5 w-5" aria-hidden="true" />
            <h2 className="font-black">تطبيق آيفون المجاني</h2>
          </div>
          <p className="mt-2 text-sm leading-7 text-[#52665a]">آبل لا تسمح بنشر تطبيق مجاني على آب ستور دون اشتراك مطوّر سنوي. لذلك تطبيق آيفون الرسمي المجاني هو تثبيت صفحة الويب من سفاري على الشاشة الرئيسية، وهو يعمل دون متصفح ظاهر.</p>
        </section>

        <p className="mt-8 text-center text-sm">
          <a href={platformHref("login")} className="font-bold text-[var(--rakiza-olive-strong)] hover:underline">العودة إلى الدخول</a>
        </p>
      </div>
    </main>
  );
}

export default InstallAppsPage;
