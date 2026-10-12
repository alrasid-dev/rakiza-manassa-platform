import { Download, Share } from "lucide-react";
import React, { useEffect, useState } from "react";
import { ANDROID_APK_URL, installSurface, isStandaloneDisplay, platformHref } from "@/lib/pwa";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<unknown>;
};

export function PwaInstallHint({ alwaysVisible = false }: { alwaysVisible?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [surface, setSurface] = useState(() => installSurface());

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    const refreshSurface = () => setSurface(installSurface(navigator.userAgent, isStandaloneDisplay()));
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", refreshSurface);
    refreshSurface();
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", refreshSurface);
    };
  }, []);

  if (surface === "installed") return null;
  if (!alwaysVisible && !deferredPrompt) return null;

  const install = async () => {
    if (!deferredPrompt) return;
    setIsRequesting(true);
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsRequesting(false);
  };

  const instruction = surface === "ios"
    ? "من سفاري: اضغط المشاركة ثم «إضافة إلى الشاشة الرئيسية». تظهر رَكيزة كتطبيق على الجهاز."
    : surface === "android"
      ? "من قائمة كروم اختر «تثبيت التطبيق»، أو حمّل ملف أندرويد المجاني."
      : "من شريط العنوان أو قائمة المتصفح اختر «تثبيت رَكيزة» لتفتح كنافذة مستقلة.";

  return (
    <aside className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#dce8dc] bg-[#f1f7f0] px-4 py-3 text-right shadow-[0_8px_20px_rgba(0,86,53,0.05)] sm:flex-row sm:items-center sm:justify-between" aria-label="تثبيت التطبيق">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#17483a]">استخدم المنصة كتطبيق على هذا الجهاز</p>
        <p className="mt-0.5 text-xs leading-5 text-[#60766b]">{deferredPrompt ? "يُفتح التطبيق في نافذة مستقلة بالحساب والصلاحيات نفسها." : instruction}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {deferredPrompt ? (
          <button type="button" onClick={() => void install()} disabled={isRequesting} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--rakiza-olive-strong)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#00582c] disabled:opacity-60">
            <Download className="h-4 w-4" aria-hidden="true" />
            {isRequesting ? "جارٍ الفتح" : "تثبيت"}
          </button>
        ) : surface === "ios" ? (
          <span className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--rakiza-olive-strong)] px-3 py-2 text-xs font-bold text-white">
            <Share className="h-4 w-4" aria-hidden="true" />
            مشاركة ثم الشاشة الرئيسية
          </span>
        ) : surface === "android" ? (
          <a href={ANDROID_APK_URL} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--rakiza-olive-strong)] px-3 py-2 text-xs font-bold text-white hover:bg-[#00582c]">
            <Download className="h-4 w-4" aria-hidden="true" />
            تحميل أندرويد
          </a>
        ) : null}
        <a href={platformHref("apps")} className="inline-flex min-h-11 items-center rounded-xl border border-[#c5d6c6] px-3 py-2 text-xs font-bold text-[#17483a] hover:bg-white">
          كل الأجهزة
        </a>
      </div>
    </aside>
  );
}
