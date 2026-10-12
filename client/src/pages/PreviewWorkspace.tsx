import DashboardLayout from "@/components/DashboardLayout";
import { Archive, CalendarDays, ClipboardCheck, FileBarChart2, FileUp, ListChecks, Scale, ShieldCheck, UsersRound, type LucideIcon } from "lucide-react";

type Workspace = "tasks" | "people" | "delays" | "decisions" | "meetings" | "reports" | "archive" | "imports";

const content: Record<Workspace, { eyebrow: string; title: string; description: string; icon: LucideIcon; items: string[]; control: string }> = {
  tasks: { eyebrow: "تشغيل وحدة شؤون الملازمين", title: "المهام والمتابعة", description: "تصميم موحد لإسناد المهام اليومية والأسبوعية والشهرية، مع سجل تحديثات ومسار اعتماد واضح.", icon: ListChecks, items: ["جدولة المهمة ومتابعة نافذة العمل", "تحديث الإنجاز وإرفاق الملاحظات", "رفع المهمة للمراجعة دون اعتماد ذاتي"], control: "سيصبح الإسناد متاحاً عند تشغيل الحسابات والصلاحيات." },
  people: { eyebrow: "إدارة الكوادر والتشكيلات", title: "الأفراد والتشكيلات", description: "تم استيراد 3 موظفين إداريين و20 ملازماً فعلياً، مع ملفات مرتبطة بالوحدة والتشكيل ونطاق الصلاحية.", icon: UsersRound, items: ["مدة ملازمة افتراضية 60 يوماً قابلة للتعديل أو التجديد", "حالة انتقال جاهز أو غير جاهز وفق المهام والمتعثرات", "إضافة أو إيقاف ملف الفرد بصلاحية تحكم كامل فقط"], control: "تحتاج تواريخ بداية الملازمة إلى تثبيت إداري قبل تفعيل حساب نهاية المدة والتنبيه." },
  delays: { eyebrow: "متابعة التعثرات", title: "سجل المتعثرات", description: "تم استيراد 229 سجل تعثر مع المرجع والتصنيف والإجراء والجهة ومالك المتابعة.", icon: ClipboardCheck, items: ["تصنيف التعثر والمرجع المرتبط به", "تعيين مالك متابعة وموعد لاحق", "توثيق الإجراء والتصعيد ضمن السجل"], control: "سيُربط ملف Teams بعد اعتماد التكامل من الجهة؛ وتظل السجلات الحالية محفوظة كمصدر داخلي." },
  decisions: { eyebrow: "حوكمة الإجراء", title: "القرارات والمساءلات", description: "إدارة الطلبات وفق تسلسل رئيس المحكمة والرئيس المساعد ومدير شؤون الملازمين.", icon: Scale, items: ["طلب رفع موثق مع مرفقاته", "مراجعة أو إرجاع مع تعليق محفوظ", "اعتماد نهائي ضمن التفويض والصلاحية"], control: "لا يتم تفعيل الاعتماد إلا مع حسابات المستخدمين المعتمدة." },
  meetings: { eyebrow: "التنسيق المؤسسي", title: "الاجتماعات والمحاضر", description: "جدولة الاجتماعات وتوثيق الحضور والمحاضر والتوصيات ضمن نطاق الوحدة.", icon: CalendarDays, items: ["حفظ الموعد ومحاور الاجتماع", "توثيق المحضر والتوصيات", "إنشاء مهام من التوصيات في مرحلة لاحقة"], control: "تحتاج دعوات الحضور وتحويل التوصيات إلى مهام إلى استكمال الربط التشغيلي." },
  reports: { eyebrow: "الرؤية الإدارية", title: "التقارير والإحصاءات", description: "لوحة يومية وأسبوعية وشهرية وتاريخية قابلة للتصفية حسب الفترة والقسم، وتُحتسب من سجلات المنصة الفعلية.", icon: FileBarChart2, items: ["مؤشرات المهام والمنجز والمتأخر", "مجموع النقاط الإيجابية والسلبية وسجل الإنجاز", "مؤشر انتقال الملازمين وعدد المتعثرات المفتوحة"], control: "تبدأ النتائج التشغيلية بالتغير فور إسناد المهام وتسجيل النقاط وإقفال المتعثرات." },
  archive: { eyebrow: "حفظ واسترجاع", title: "الأرشيف المؤسسي", description: "إطار أرشفة للقرارات والمساءلات والتعليقات والنماذج مع أثر واضح لكل إجراء.", icon: Archive, items: ["مرجع إداري لكل مستند", "تصنيف وفترة احتفاظ", "استرجاع مقيد بالصلاحيات"], control: "تُحدد سياسة الاحتفاظ مع مالك البيانات قبل استخدام الأرشيف الفعلي." },
  imports: { eyebrow: "التحقق قبل الإدخال", title: "استيراد البيانات", description: "تمت معالجة الملفات المرفقة وحفظ مصدر بيانات الأفراد ومصدر المهام والمتعثرات وتقرير المتابعة اليومي كوثائق قابلة للرجوع.", icon: FileUp, items: ["فحص الأعمدة والصفوف واستبعاد الشواغر", "تسجيل دفعة الاستيراد ومصدرها", "مراجعة قبل الإدخال إلى السجلات"], control: "تُتاح دفعات استيراد جديدة بعد دخول مالك المنصة أو موظف ذي صلاحية تحكم كامل." },
};

export default function PreviewWorkspace({ workspace }: { workspace: Workspace }) {
  const item = content[workspace];
  const Icon = item.icon;
  return (
    <DashboardLayout>
      <section className="mx-auto w-full min-w-0 max-w-6xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-[#d9e4d6] bg-gradient-to-l from-[#006c35] to-[#155d3e] px-6 py-8 text-white shadow-[0_22px_55px_rgba(0,91,48,0.18)] sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute inset-0 bg-cover bg-[center_bottom] opacity-20 mix-blend-screen" style={{ backgroundImage: "url('/manus-storage/court-hexagonal-reference_ee1cd00a.jpg')" }} />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-bold tracking-[0.15em] text-[#e7c982]">{item.eyebrow}</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">{item.title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[#e5f0e6]">{item.description}</p></div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10 text-[#f2d88e]"><Icon className="h-7 w-7" /></div>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">{item.items.map((text, index) => <article key={text} className="rounded-2xl border border-[#e2e7de] bg-white p-5 shadow-[0_10px_25px_rgba(24,66,43,0.05)]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#edf4ee] text-xs font-bold text-[var(--rakiza-olive-strong)]">0{index + 1}</span><p className="mt-5 text-sm font-bold leading-6 text-[#254d38]">{text}</p></article>)}</div>
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-[#e3d8bd] bg-[#fffaf0] p-5 sm:flex-row sm:items-center"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f5e6bf] text-[#8b6828]"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-bold text-[#325541]">وضع المعاينة الداخلي</h2><p className="mt-1 text-sm leading-6 text-[#6d785b]">{item.control}</p></div></div>
      </section>
    </DashboardLayout>
  );
}
