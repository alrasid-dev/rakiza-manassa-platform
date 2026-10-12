import {
  BellDot,
  BookOpenCheck,
  CalendarClock,
  ChartNoAxesCombined,
  ChevronLeft,
  CircleAlert,
  ClipboardCheck,
  FileText,
  Gavel,
  Landmark,
  ListTodo,
  MailOpen,
  MessagesSquare,
  PanelsTopLeft,
  Scale,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import React from "react";

const navigation = [
  { label: "لوحة القيادة", icon: PanelsTopLeft, active: true },
  { label: "التنبيهات", icon: BellDot, badge: "—" },
  { label: "الدردشات", icon: MessagesSquare, badge: "—" },
  { label: "بريد ركيزة", icon: MailOpen, badge: "—" },
  { label: "مهامي", icon: ListTodo },
  { label: "التقارير", icon: ChartNoAxesCombined },
];

const metrics = [
  { label: "مهام اليوم", hint: "إجمالي الأعمال المسندة", icon: ClipboardCheck, tone: "emerald" },
  { label: "قرب موعدها", hint: "تحتاج متابعة اليوم", icon: CalendarClock, tone: "gold" },
  { label: "بانتظار الاعتماد", hint: "تحت المراجعة الإدارية", icon: FileText, tone: "violet" },
  { label: "تنبيهات مهمة", hint: "تظهر عند وجود إجراء", icon: CircleAlert, tone: "coral" },
];

const samples = [
  { title: "عنوان مهمة أو معاملة", context: "قسم الجهة المختصة · قيد المراجعة", state: "إجراء مطلوب", tone: "gold" },
  { title: "متابعة قرار أو خطاب داخلي", context: "سجل الأعمال اليومي · ضمن المسار", state: "ضمن المسار", tone: "green" },
  { title: "مراجعة مستند مرفق", context: "يمكن عرض التفاصيل من دون مغادرة اللوحة", state: "للمراجعة", tone: "slate" },
];

export default function MinimalJusticePreviewPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#eee9dc] p-3 text-[#20372f] sm:p-5" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1600px] overflow-hidden rounded-[2rem] border border-[#d9d0bf] bg-[#f8f5ed] shadow-[0_26px_80px_rgba(20,48,40,0.13)] lg:grid-cols-[17.5rem_minmax(0,1fr)] sm:min-h-[calc(100vh-2.5rem)]">
        <aside className="relative border-b border-white/10 bg-[#10392f] px-4 py-5 text-[#eef7ee] lg:border-b-0 lg:border-l lg:px-5 lg:py-7">
          <div className="absolute left-0 top-0 h-28 w-28 rounded-full bg-[#d7ad59]/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-center gap-3 border-b border-white/10 pb-5">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#e7c878]/35 bg-[var(--rakiza-olive-strong)] text-[#f6dda0] shadow-[0_0_24px_rgba(216,178,91,0.24)]">
              <Scale className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight">رَكيزة</p>
              <p className="mt-0.5 text-[10px] font-bold text-[#c8d7cc]">معاينة تصميم فقط</p>
            </div>
          </div>

          <nav className="relative mt-5 grid grid-cols-2 gap-2 lg:block lg:space-y-1.5" aria-label="معاينة التنقل">
            {navigation.map(item => {
              const Icon = item.icon;
              return <button key={item.label} type="button" className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-right text-xs font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3cf78] lg:w-full ${item.active ? "bg-[#047543] text-white shadow-[0_9px_26px_rgba(0,0,0,0.16)]" : "text-[#d8e7db] hover:bg-white/8 hover:text-white"}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-lg ${item.active ? "bg-white/12 text-[#f5d98f]" : "bg-white/6 text-[#9ed2b4] group-hover:bg-white/12"}`}><Icon className="h-4 w-4" strokeWidth={1.9} /></span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black ${item.active ? "bg-[#f3cf78] text-[#153d30]" : "bg-white/10 text-[#e8f3e9]"}`}>{item.badge}</span>}
              </button>;
            })}
          </nav>

          <div className="relative mt-5 hidden rounded-2xl border border-[#e7c878]/20 bg-white/5 p-4 lg:block">
            <div className="flex items-center gap-2 text-[#f4d88f]"><Sparkles className="h-4 w-4" /><span className="text-xs font-black">لغة التصميم</span></div>
            <p className="mt-2 text-[11px] leading-6 text-[#d2e0d5]">وحدات واضحة، رموز خطية حديثة، ولمسات ذهبية هادئة للحالة النشطة فقط.</p>
          </div>
        </aside>

        <main className="min-w-0 p-4 sm:p-7 lg:p-8">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ded6c7] pb-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#dfe7df] bg-[#f2f8f2] text-[var(--rakiza-olive-strong)]"><Landmark className="h-5 w-5" strokeWidth={1.8} /></span>
              <div><p className="text-[11px] font-bold tracking-[0.12em] text-[#ad8341]">MINIMAL JUSTICE GRID</p><h1 className="mt-1 text-xl font-black tracking-tight text-[#173b31] sm:text-2xl">لوحة القيادة المعيارية</h1></div>
            </div>
            <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-[#cfc4b0] bg-white px-3 py-2 text-xs font-black text-[#315a4a] transition-colors hover:border-[#9ebca7] hover:bg-[#f2f7f2]"><ChevronLeft className="h-4 w-4" />العودة للمنصة</a>
          </header>

          <section className="mt-6 rounded-2xl border border-[#d9d0bf] bg-[#fbfaf5] p-4 shadow-[0_8px_28px_rgba(38,62,50,0.045)] sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black text-[var(--rakiza-olive-strong)]">معاينة مرئية</p><h2 className="mt-1 text-lg font-black text-[#24473b]">وضوح إداري بلا ازدحام</h2><p className="mt-1 max-w-2xl text-xs leading-6 text-[#6a796f]">هذه صفحة مراجعة للتصميم المقترح، ولا تعرض أرقام تشغيلية أو تغيّر بيانات المنصة.</p></div><div className="flex items-center gap-2 rounded-xl bg-[#edf5ee] px-3 py-2 text-xs font-bold text-[#2e6a4d]"><ShieldCheck className="h-4 w-4" />هوية ركيزة الخضراء</div></div>
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(item => {
              const Icon = item.icon;
              const tone = item.tone === "emerald" ? "border-[#bbd7c1] bg-[#f0f7f0] text-[#1f7147]" : item.tone === "gold" ? "border-[#e7d4a1] bg-[#fff9e8] text-[#8d6a25]" : item.tone === "violet" ? "border-[#ddd2ea] bg-[#f7f2fb] text-[#74568b]" : "border-[#edcdc5] bg-[#fff4f1] text-[#a45745]";
              return <article key={item.label} className={`rounded-2xl border p-4 shadow-[0_7px_20px_rgba(35,54,44,0.035)] ${tone}`}><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/75"><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span><span className="text-2xl font-black">—</span></div><p className="mt-5 text-sm font-black">{item.label}</p><p className="mt-1 text-[11px] font-semibold opacity-75">{item.hint}</p></article>;
            })}
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <article className="rounded-2xl border border-[#d9d0bf] bg-white p-4 shadow-[0_10px_32px_rgba(38,62,50,0.045)] sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-[#eee8dc] pb-4"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf4ec] text-[var(--rakiza-olive-strong)]"><ListTodo className="h-4 w-4" /></span><div><h2 className="text-sm font-black text-[#24473b]">مسار العمل اليومي</h2><p className="mt-0.5 text-[10px] font-semibold text-[#8a978f]">شكل مقترح لقائمة الأعمال</p></div></div><button type="button" className="rounded-lg border border-[#d4e0d5] px-2.5 py-1.5 text-[10px] font-black text-[#2d6849]">عرض الكل</button></div>
              <div className="divide-y divide-[#eee8dc]">{samples.map((item, index) => <div key={item.title} className="flex items-center gap-3 py-4"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.tone === "gold" ? "bg-[#fff5d8] text-[#966e1d]" : item.tone === "green" ? "bg-[#eaf6ed] text-[#24734b]" : "bg-[#f0f3f4] text-[#5c7376]"}`}><ClipboardCheck className="h-4 w-4" strokeWidth={1.8} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-[#2a493d]">{item.title}</p><p className="mt-1 truncate text-[11px] text-[#78867e]">{item.context}</p></div><span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-black sm:block ${item.tone === "gold" ? "bg-[#fff7e4] text-[#8b6825]" : item.tone === "green" ? "bg-[#edf8f0] text-[#237047]" : "bg-[#f1f3f4] text-[#61727a]"}`}>{item.state}</span><ChevronLeft className="h-4 w-4 text-[#8b9b90]" /></div>)}</div>
            </article>

            <aside className="rounded-2xl border border-[#d9d0bf] bg-[#173d32] p-5 text-[#f4f8f2] shadow-[0_12px_35px_rgba(22,54,44,0.14)]">
              <div className="flex items-center gap-2 text-[#efd18a]"><Gavel className="h-4 w-4" /><span className="text-xs font-black">الهيكل الرسمي</span></div>
              <h2 className="mt-3 text-base font-black">الوصول المنظم</h2>
              <p className="mt-2 text-xs leading-6 text-[#cce0d3]">تظهر الأقسام والمهام حسب الصلاحية، مع رموز واضحة تقلل ازدحام القائمة.</p>
              <div className="mt-5 space-y-2 border-t border-white/10 pt-4"><div className="flex items-center gap-3 text-xs font-bold"><UsersRound className="h-4 w-4 text-[#9fd1af]" />أمانة المحكمة</div><div className="mr-3 flex items-center gap-3 text-xs font-bold text-[#d5e7dc]"><BookOpenCheck className="h-4 w-4 text-[#d9b96d]" />المكتب التنسيقي</div><div className="mr-6 flex items-center gap-3 text-xs font-bold text-[#d5e7dc]"><ChartNoAxesCombined className="h-4 w-4 text-[#d9b96d]" />الإدارات والأقسام</div></div>
              <div className="mt-6 rounded-xl border border-[#d9b96d]/25 bg-white/5 p-3 text-[11px] leading-6 text-[#d9e8dc]"><span className="font-black text-[#f1d58e]">التفاعل المقترح:</span> توهج ذهبي خفيف عند التركيز، وحركة قصيرة عند الانتقال فقط.</div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}
