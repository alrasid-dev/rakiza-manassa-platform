import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { PwaInstallHint } from "@/components/PwaInstallHint";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { playTone, TONE_IDS, TONE_LABELS, type ToneId } from "@/lib/alert-tones";
import { Bell, Volume2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function NotificationSettingsPage() {
  const { prefs, save } = useNotificationPreferences();
  const [toneId, setToneId] = useState<ToneId>(prefs.toneId);
  const [volumePct, setVolumePct] = useState(Math.round(prefs.volume * 100));

  const playPreview = (id: ToneId) => { void playTone(id, volumePct / 100); };

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-[#12352f]">إعدادات التنبيهات</h1>
        <p className="mt-1 text-sm leading-6 text-[#65766d]">اختر نغمة التنبيه ودرجة الصوت، وثبّت المنصة كتطبيق لضمان وصول الإشعارات حتى في الخلفية.</p>

        <div className="mt-5">
          <PwaInstallHint alwaysVisible />
        </div>

        <div className="mt-6 rounded-2xl border border-[#e7e0d4] bg-white p-4">
          <h2 className="flex items-center gap-2 font-bold text-[#12352f]"><Bell className="h-4 w-4" /> نغمة التنبيه</h2>
          <div className="mt-3 space-y-2">
            {TONE_IDS.map(id => (
              <label key={id} className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${toneId === id ? "border-[#2d6b4f] bg-[#eef7ef]" : "border-[#e7e0d4] bg-[#fbfaf6]"}`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="tone" checked={toneId === id} onChange={() => setToneId(id)} className="h-4 w-4 accent-[#2d6b4f]" />
                  <span className="font-bold text-[#29463b]">{TONE_LABELS[id]}</span>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => playPreview(id)}>تجربة</Button>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[#e7e0d4] bg-white p-4">
          <h2 className="flex items-center gap-2 font-bold text-[#12352f]"><Volume2 className="h-4 w-4" /> درجة الصوت</h2>
          <div className="mt-3 flex items-center gap-3">
            <input type="range" min={0} max={100} value={volumePct} onChange={e => setVolumePct(Number(e.target.value))} className="flex-1 accent-[#2d6b4f]" aria-label="درجة الصوت" />
            <span className="w-12 text-center text-sm font-bold text-[#29463b]">{volumePct}%</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={() => { playPreview(toneId); }} variant="outline">اختبار التنبيه</Button>
          <Button type="button" onClick={() => { save({ toneId, volume: volumePct / 100 }); toast.success("تم حفظ تفضيلات التنبيه."); }}>حفظ التفضيلات</Button>
        </div>

        <div className="mt-6 rounded-xl border border-[#e8d9c4] bg-[#fffaf0] p-4 text-xs leading-6 text-[#7b6b50]">
          <p className="font-bold">قيود المتصفح:</p>
          <p>• قد تمنع المتصفحات الصوت قبل أول تفاعل من المستخدم — لذا يُشغَّل الصوت بعد أول نقرة.</p>
          <p>• على iOS (سفاري) لا يعمل Web Push ما لم يُثبَّت التطبيق على الشاشة الرئيسية.</p>
          <p>• عند إغلاق التطبيق، يُسلَّم الإشعار عبر Web Push (بنغمة النظام والاهتزاز) وليس بنغمة الويب.</p>
        </div>
      </section>
    </DashboardLayout>
  );
}
