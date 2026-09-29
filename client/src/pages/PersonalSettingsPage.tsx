import DashboardLayout from "@/components/DashboardLayout";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { ICON_GUIDE } from "@/lib/icon-guide";
import { applyAppearancePreferences, persistAppearancePreferences, RAKIZA_FONTS, RAKIZA_FONT_SIZES, readAppearancePreferences, type RakizaFontId, type RakizaFontSizeId } from "@/lib/appearance";
import { trpc } from "@/lib/trpc";
import { BellRing, BookOpen, Download, FileText, Moon, Type } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

export default function PersonalSettingsPage() {
  const api = (trpc.court as any).workPreferences;
  const mine = api?.mine?.useQuery ? api.mine.useQuery() : { data: { notificationsEnabled: true, dndUntil: null } };
  const update = api?.update?.useMutation ? api.update.useMutation({ onSuccess: () => toast.success("تم حفظ إعداداتك.") }) : { mutate: () => undefined, isPending: false };
  const policiesApi = (trpc.court as any).policies;
  const policiesPdf = policiesApi?.pdf?.useQuery ? policiesApi.pdf.useQuery({ enabled: false }) : { refetch: async () => ({ data: null }), isFetching: false };
  const handleDownloadPdf = async () => {
    try {
      const result = await policiesPdf.refetch();
      const base64 = result?.data?.base64;
      if (!base64) {
        toast.error("تعذر توليد الملف");
        return;
      }
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success("تم توليد دليل السياسات");
    } catch (error: any) {
      toast.error(error?.message || "تعذر توليد الملف");
    }
  };
  const [hours, setHours] = useState("2");
  const [fontId, setFontId] = useState<RakizaFontId>("tajawal");
  const [sizeId, setSizeId] = useState<RakizaFontSizeId>("md");
  useEffect(() => {
    const prefs = readAppearancePreferences();
    setFontId(prefs.fontId);
    setSizeId(prefs.sizeId);
    applyAppearancePreferences(prefs.fontId, prefs.sizeId);
  }, []);
  const saveAppearance = (nextFont: RakizaFontId, nextSize: RakizaFontSizeId) => {
    setFontId(nextFont);
    setSizeId(nextSize);
    persistAppearancePreferences(nextFont, nextSize);
    toast.success("تم حفظ مظهر الخط على هذا الجهاز.");
  };
  return <DashboardLayout hideUtilityPrompts><section dir="rtl" className="mx-auto max-w-4xl"><header className="mb-6"><p className="text-xs font-black text-[#4a785a]">حسابك فقط</p><h1 className="mt-2 text-3xl font-black text-[#12352f]">إعدادات الموظف</h1><p className="mt-2 text-sm text-[#53695e]">تفعيل التنبيهات، عدم الإزعاج، الخطوط العربية المجانية، والدليل الإرشادي. لا تغيّر هذه الصفحة صلاحيات الآخرين.</p></header>
    <div className="grid gap-5">
      <section className="rounded-[1.5rem] border bg-[#f8f8f3] p-5"><div className="flex items-center gap-3"><BellRing className="h-5 w-5 text-[#2d6b4f]" /><h2 className="font-black">التنبيهات</h2></div><label className="mt-4 flex items-center justify-between text-sm font-bold"><span>استقبال التنبيهات</span><input type="checkbox" checked={mine.data?.notificationsEnabled !== false} onChange={event => update.mutate({ notificationsEnabled: event.target.checked })} className="h-4 w-4 accent-[#2d6b4f]" /></label><p className="mt-3 text-xs leading-6 text-[#65766d]">يمكنك تعيين بريد شخصي (Gmail وغيره) لاستقبال التنبيهات بجانب بريدك الرسمي.</p><a href="/email-settings" className="mt-2 inline-block text-sm font-bold text-[#006c35] hover:underline">إدارة بريد الإشعارات الشخصي</a><div className="mt-4"><PushNotificationPrompt /></div></section>
      <section className="rounded-[1.5rem] border bg-[#f8f8f3] p-5"><div className="flex items-center gap-3"><Moon className="h-5 w-5 text-[#2d6b4f]" /><h2 className="font-black">عدم الإزعاج</h2></div><div className="mt-4 flex flex-wrap gap-2"><select value={hours} onChange={event => setHours(event.target.value)} className="h-10 rounded-xl border px-3 text-sm"><option value="1">ساعة</option><option value="2">ساعتان</option><option value="8">حتى نهاية الدوام</option></select><button type="button" onClick={() => update.mutate({ dndUntil: new Date(Date.now() + Number(hours) * 3600_000) })} className="rounded-xl bg-[#2d6b4f] px-3 py-2 text-xs font-black text-white">تفعيل</button><button type="button" onClick={() => update.mutate({ dndUntil: null })} className="rounded-xl border px-3 py-2 text-xs font-black">إلغاء</button></div></section>
      <section className="rounded-[1.5rem] border bg-white p-5"><div className="flex items-center gap-3"><Type className="h-5 w-5 text-[#2d6b4f]" /><h2 className="font-black">الخط العربي وحجمه</h2></div><p className="mt-2 text-xs leading-6 text-[#65766d]">خمسة خطوط مجانية من Google Fonts. يُحفظ اختيارك محلياً على هذا الجهاز فقط.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{RAKIZA_FONTS.map(font => <button key={font.id} type="button" onClick={() => saveAppearance(font.id, sizeId)} className={`rounded-xl border px-3 py-3 text-right transition ${fontId === font.id ? "border-[#2d6b4f] bg-[#e8f3ea] ring-2 ring-[#2d6b4f]/20" : "border-[#d7e0d4] bg-[#f8f8f3] hover:bg-[#eef5ec]"}`}><span className="block text-xs font-black text-[#29463b]">{font.label}</span><span className="mt-1 block text-sm text-[#355d4b]" style={{ fontFamily: font.family }}>{font.sample}</span></button>)}</div><div className="mt-4 flex flex-wrap gap-2">{RAKIZA_FONT_SIZES.map(size => <button key={size.id} type="button" onClick={() => saveAppearance(fontId, size.id)} className={`rounded-full px-3 py-1.5 text-xs font-black ${sizeId === size.id ? "bg-[#2d6b4f] text-white" : "bg-[#eef2ed] text-[#496257]"}`}>{size.label}</button>)}</div></section>
      <section className="rounded-[1.5rem] border bg-white p-5"><div className="flex items-center gap-3"><BookOpen className="h-5 w-5 text-[#2d6b4f]" /><h2 className="font-black">الدليل الإرشادي</h2></div><a href="/guide" className="mt-3 inline-block text-sm font-bold text-[#006c35]">فتح دليل الاستخدام الكامل</a><div className="mt-4 grid gap-3 md:grid-cols-2">{ICON_GUIDE.slice(0, 6).map(item => <article key={item.name} className="rounded-xl bg-[#f7faf6] p-3"><p className="text-sm font-black">{item.name}</p><p className="mt-1 text-xs leading-6 text-[#65766d]">{item.actions}</p></article>)}</div></section>
      <section className="rounded-[1.5rem] border bg-white p-5"><div className="flex items-start gap-4"><div className="rounded-full bg-[#e6efe4] p-3"><FileText className="h-6 w-6 text-[#006c35]" /></div><div className="flex-1"><h2 className="font-black">دليل السياسات الخاص بي</h2><p className="mt-1 text-sm text-gray-600">يحتوي على السياسات والإجراءات المتعلقة بدورك في المنصة.</p><button type="button" onClick={handleDownloadPdf} disabled={policiesPdf.isFetching} className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#006c35] px-4 py-2 text-white hover:bg-[#005a2c] disabled:opacity-50"><Download className="h-4 w-4" />{policiesPdf.isFetching ? "جارٍ التوليد..." : "تحميل PDF"}</button></div></div></section>
    </div>
  </section></DashboardLayout>;
}
