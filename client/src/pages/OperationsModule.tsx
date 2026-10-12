import DashboardLayout from "@/components/DashboardLayout";
import { ArrowLeft, ArrowUpLeft, CalendarDays, CircleAlert, FileText, Filter, ShieldCheck, UsersRound } from "lucide-react";
import { useLocation } from "wouter";

type ModuleType = "tasks" | "people" | "delays" | "decisions" | "reports" | "archive";

const moduleConfig: Record<ModuleType, { eyebrow: string; title: string; description: string; stats: { value: string; label: string; tone: string }[]; actions: string[]; note: string }> = {
  tasks: {
    eyebrow: "تشغيل وحدة شؤون الملازمين",
    title: "المهام والمتابعة",
    description: "قوالب العمل الدورية، مهام اليوم، ومراحل المراجعة ضمن التسلسل الإداري المعتمد.",
    stats: [{ value: "9", label: "مهام يومية", tone: "bg-[#e8f0ea] text-[#155440]" }, { value: "6", label: "مهام أسبوعية", tone: "bg-[#eef1f5] text-[#3d5e78]" }, { value: "11", label: "مهام شهرية", tone: "bg-[#f7efe0] text-[#80612b]" }],
    actions: ["إسناد المهام وفق القالب المعتمد", "متابعة المهام خلال نافذة العمل", "رفع التأخرات للمراجعة الإدارية"],
    note: "سيتم تفعيل إنشاء المهام والتحديث الفعلي بعد ربط قاعدة البيانات ومسار الاعتماد.",
  },
  people: {
    eyebrow: "إدارة الأفراد",
    title: "الأفراد والتشكيلات",
    description: "ملفات إدارية منظمة للموظفين والملازمين، مرتبطة بالتشكيلات ومجالات الوصول المصرح بها.",
    stats: [{ value: "3", label: "موظفون إداريون", tone: "bg-[#e8f0ea] text-[#155440]" }, { value: "117", label: "سجلات ملازمين", tone: "bg-[#eef1f5] text-[#3d5e78]" }, { value: "1", label: "وحدة مبدئية", tone: "bg-[#f7efe0] text-[#80612b]" }],
    actions: ["مراجعة بيانات السجل قبل التفعيل", "ربط الملازم بالتشكيل القضائي", "إدارة الحالة ونمط الحضور"],
    note: "لا تظهر البيانات الشخصية الكاملة إلا للمستخدمين المخولين ضمن نطاقهم الإداري.",
  },
  delays: {
    eyebrow: "المتابعة الاستباقية",
    title: "سجل المتعثرات",
    description: "حصر منظم للمعاملات المتأخرة، المالك الإداري، الإجراء المتخذ، وتاريخ كل تصعيد.",
    stats: [{ value: "229", label: "سجل متعثرات", tone: "bg-[#f7efe0] text-[#80612b]" }, { value: "153", label: "تحت المتابعة", tone: "bg-[#eef1f5] text-[#3d5e78]" }, { value: "76", label: "متأخر", tone: "bg-[#f8e8e4] text-[var(--rakiza-danger)]" }],
    actions: ["تسجيل سبب التعثر وإجراء المعالجة", "إسناد مالك متابعة وموعد استحقاق", "رفع حالات التأخر لمسار الاعتماد"],
    note: "سيُستورد ملف Teams بعد منح صلاحية الوصول المقيدة للمورد المعتمد فقط.",
  },
  decisions: {
    eyebrow: "حوكمة الإجراء",
    title: "القرارات والمساءلات",
    description: "مسارات رفع ومراجعة واعتماد لا تسمح بتجاوز المستوى الإداري أو فقدان الأثر الرقابي.",
    stats: [{ value: "3", label: "مستويات اعتماد", tone: "bg-[#e8f0ea] text-[#155440]" }, { value: "6", label: "ساعات المراجعة", tone: "bg-[#f7efe0] text-[#80612b]" }, { value: "100%", label: "سجل تدقيق", tone: "bg-[#eef1f5] text-[#3d5e78]" }],
    actions: ["إنشاء طلب رفع أو مساءلة", "إرجاع الطلب مع تعليق موثق", "اعتماد الإجراء وفق التفويض"],
    note: "تُحفظ كل خطوة وتعليق وقرار في سجل دائم قابل للاسترجاع حسب الصلاحية.",
  },
  reports: {
    eyebrow: "الرؤية الإدارية",
    title: "التقارير والإحصاءات",
    description: "ملخصات يومية وأسبوعية وشهرية قابلة للتصفية حسب القسم والفترة والحالة التشغيلية.",
    stats: [{ value: "يومي", label: "دورية تقرير", tone: "bg-[#e8f0ea] text-[#155440]" }, { value: "أسبوعي", label: "مراجعة أداء", tone: "bg-[#eef1f5] text-[#3d5e78]" }, { value: "شهري", label: "ملخص إداري", tone: "bg-[#f7efe0] text-[#80612b]" }],
    actions: ["تصفية النتائج حسب القسم", "تتبع المنجز والمتأخر", "عرض سجل الإنجاز الفردي"],
    note: "تعتمد المؤشرات النهائية على السجلات الفعلية ولا تستخدم بيانات تقديرية أو غير موثقة.",
  },
  archive: {
    eyebrow: "حفظ واسترجاع مضبوط",
    title: "الأرشيف المؤسسي",
    description: "مستودع منظم للقرارات والمساءلات والتعليقات والنماذج، مع قيود وصول وسجل استرجاع.",
    stats: [{ value: "دائم", label: "سجل الإجراءات", tone: "bg-[#e8f0ea] text-[#155440]" }, { value: "مقيد", label: "الوصول", tone: "bg-[#f7efe0] text-[#80612b]" }, { value: "موثق", label: "الاسترجاع", tone: "bg-[#eef1f5] text-[#3d5e78]" }],
    actions: ["حفظ المستند مع مرجعه الإداري", "استرجاع حسب الصلاحية", "مراجعة أثر التعديل أو العرض"],
    note: "تحدد سياسة الجهة مدة الاحتفاظ والتصنيف قبل إدخال المستندات الحقيقية إلى بيئة التشغيل.",
  },
};

export default function OperationsModule({ type }: { type: ModuleType }) {
  const config = moduleConfig[type];
  const [, setLocation] = useLocation();

  return (
    <DashboardLayout>
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-[var(--rakiza-gold)]">{config.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--rakiza-ink)] sm:text-4xl">{config.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#61736a] sm:text-base">{config.description}</p>
          </div>
          <button type="button" onClick={() => setLocation("/")} className="inline-flex items-center gap-2 self-start rounded-xl border border-[#ddd6c7] bg-white px-4 py-2.5 text-sm font-bold text-[#355146] transition hover:bg-[#faf8f2] sm:self-auto"><ArrowLeft className="h-4 w-4" /> العودة للوحة القيادة</button>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {config.stats.map(stat => <div key={stat.label} className={`rounded-2xl p-5 ${stat.tone}`}><p className="text-3xl font-bold">{stat.value}</p><p className="mt-1 text-xs font-bold opacity-75">{stat.label}</p></div>)}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="rounded-[1.5rem] border border-[#e9e2d7] bg-white p-5 shadow-[0_12px_35px_rgba(30,51,42,0.05)] sm:p-7">
            <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-[var(--rakiza-gold)]" /><h2 className="text-lg font-bold text-[var(--rakiza-ink)]">مسار العمل</h2></div>
            <div className="mt-5 divide-y divide-[#efe9df]">
              {config.actions.map((action, index) => <div key={action} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf1eb] text-xs font-bold text-[#245145]">0{index + 1}</span><p className="text-sm font-semibold text-[#43564d]">{action}</p><ArrowUpLeft className="mr-auto h-4 w-4 text-[var(--rakiza-gold)]" /></div>)}
            </div>
          </div>
          <aside className="rounded-[1.5rem] bg-[var(--rakiza-olive-strong)] p-6 text-[#f8f4e9] shadow-[0_16px_36px_rgba(18,53,47,0.18)]"><ShieldCheck className="h-6 w-6 text-[#e7c982]" /><h2 className="mt-5 text-lg font-bold">تنبيه تشغيلي</h2><p className="mt-3 text-sm leading-7 text-[#d9e1d7]">{config.note}</p><div className="mt-6 flex items-center gap-2 border-t border-white/15 pt-4 text-xs font-bold text-[#e7c982]"><Filter className="h-4 w-4" /> نطاق الوصول محكوم بالدور</div></aside>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#eadfca] bg-[#fffaf0] p-4 text-sm text-[#765c33]"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><p>هذه الواجهة تُظهر الهيكل التشغيلي المعتمد. ستظهر الإجراءات والسجلات الحقيقية بعد اكتمال ربط قاعدة البيانات وضوابط الاعتماد.</p></div>
      </section>
    </DashboardLayout>
  );
}
