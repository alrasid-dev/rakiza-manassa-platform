import DashboardLayout from "@/components/DashboardLayout";
import { ICON_GUIDE } from "@/lib/icon-guide";
import { trpc } from "@/lib/trpc";
import { BadgeHelp, BellRing, CircleHelp, ClipboardCheck, FileUp, MessageSquareText, ShieldCheck, Wrench } from "lucide-react";

const coreGuidance = [{ icon: BellRing, title: "مركز الإشعارات", text: "رمز الجرس أعلى الصفحة يعرض إسنادات المهام والتصعيدات والمراسلات. اختر «تمت القراءة» بعد الاطلاع." }, { icon: ClipboardCheck, title: "مهامي", text: "استخدم «تمت المعالجة» عند إنهاء العمل لإحالته للمراجعة، أو أضف تعليقاً لشرح العائق بدلاً من ترك المهمة دون تحديث." }, { icon: MessageSquareText, title: "المراسلات والطلبات", text: "اكتب الموضوع والطلب بوضوح. تظهر تفاصيل المسار فقط للأدوار المخولة ولا تكشف لك مراسلات الآخرين." }, { icon: Wrench, title: "الدعم التقني", text: "سجل الإشكال وارفق صورة شاشة عند الحاجة. تتلقى تحديثات التذكرة من صفحة الدعم ومن مركز الإشعارات." }];

export function UserGuidePage() {
  const permission = trpc.court.registration.myPermission.useQuery();
  const roles = trpc.court.myRoles.useQuery();
  const isLeadership = roles.data?.some(role => ["court_president", "assistant_president", "technical_support_manager"].includes(role));
  const isSupport = roles.data?.includes("technical_support_agent") || isLeadership;
  const roleLabel = isLeadership ? "صلاحية قيادية" : isSupport ? "موظف دعم تقني" : permission.data === "trainee" ? "ملازم قضائي" : permission.data === "employee" ? "موظف إداري" : "مستخدم مخول";
  return (
    <DashboardLayout>
      <section className="mx-auto max-w-6xl">
        <header className="rounded-[1.7rem] border border-[#e5ded1] bg-white p-6 shadow-[0_12px_32px_rgba(32,54,45,0.05)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.15em] text-[var(--rakiza-gold)]">دليل الاستخدام</p>
              <h1 className="mt-2 text-3xl font-bold text-[var(--rakiza-ink)]">مرحباً بك في المنصة</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--rakiza-muted)]">يعرض لك هذا الدليل ما تحتاجه ضمن نطاق صلاحيتك. لا تظهر الوظائف أو السجلات غير المرتبطة بعملك.</p>
            </div>
            <div className="rounded-2xl bg-[#eaf2eb] px-4 py-3 text-sm font-bold text-[#1f5b3c]">{roleLabel}</div>
          </div>
        </header>
        <div className="mt-6 grid gap-4 md:grid-cols-2">{coreGuidance.map(item => <article key={item.title} className="rounded-[1.35rem] border border-[#e8e2d7] bg-white p-5 shadow-[0_8px_22px_rgba(30,51,42,0.04)]"><item.icon className="h-5 w-5 text-[var(--rakiza-olive-strong)]" /><h2 className="mt-4 font-bold text-[#1c4435]">{item.title}</h2><p className="mt-2 text-sm leading-7 text-[#68796f]">{item.text}</p></article>)}</div>
        <section className="mt-6 rounded-[1.5rem] bg-[#f1f6f1] p-6">
          <div className="flex items-center gap-2 text-[#1c573b]"><BadgeHelp className="h-5 w-5" /><h2 className="font-bold">إرشادات بحسب صلاحيتك</h2></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <article className="rounded-xl bg-white p-4"><h3 className="font-bold text-[#294b3d]">الموظف أو الملازم أو القاضي</h3><p className="mt-2 text-sm leading-6 text-[#6c7c73]">تستخدم ملفك ومهامك وطلباتك فقط. لا تتشارك بيانات الآخرين ولا تظهر التقارير الإدارية الشاملة.</p></article>
            {isLeadership && <article className="rounded-xl bg-white p-4"><h3 className="font-bold text-[#294b3d]">القيادة ومدير القسم</h3><p className="mt-2 text-sm leading-6 text-[#6c7c73]">تظهر البيانات ضمن التفويض والوحدة المعتمدة. راجع سجل الحركة قبل منح أو سحب أي صلاحية.</p></article>}
            {isSupport && <article className="rounded-xl bg-white p-4"><h3 className="font-bold text-[#294b3d]">موظف الدعم التقني</h3><p className="mt-2 text-sm leading-6 text-[#6c7c73]">تظهر لك التذاكر المسندة إليك فقط. استخدم الملاحظات الداخلية للمعلومات التشغيلية ولا تضع فيها بيانات لا تتصل بالمعالجة.</p></article>}
          </div>
        </section>
        <section className="mt-6 rounded-[1.5rem] border border-[var(--rakiza-border)] bg-white p-6">
          <div className="flex items-center gap-2 text-[#1c573b]"><FileUp className="h-5 w-5" /><h2 className="font-bold">دليل الأيقونات</h2></div>
          <p className="mt-2 text-sm leading-7 text-[var(--rakiza-muted)]">لكل أيقونة: ماذا تحتوي، ماذا تستطيع فعله، من يملك الصلاحية، وملاحظة تقنية.</p>
          <div className="mt-4 grid gap-4">{ICON_GUIDE.map(item => (
            <article key={item.name} className="rounded-2xl border border-[var(--rakiza-border)] bg-[#fbfcfa] p-4">
              <h3 className="text-lg font-black text-[var(--rakiza-ink)]">{item.name}</h3>
              <dl className="mt-3 grid gap-2 text-sm leading-7 text-[#52665c]">
                <div><dt className="text-xs font-black text-[var(--rakiza-gold)]">ماذا تحتوي</dt><dd>{item.contains}</dd></div>
                <div><dt className="text-xs font-black text-[var(--rakiza-gold)]">ماذا تستطيع فعله</dt><dd>{item.actions}</dd></div>
                <div><dt className="text-xs font-black text-[var(--rakiza-gold)]">من يملك صلاحية استخدامها</dt><dd>{item.who}</dd></div>
                <div><dt className="text-xs font-black text-[var(--rakiza-gold)]">ملاحظات تقنية</dt><dd>{item.notes}</dd></div>
              </dl>
            </article>
          ))}</div>
        </section>
        <section className="mt-6 rounded-[1.5rem] border border-[#ecdcb9] bg-[#fffaf0] p-5">
          <div className="flex items-center gap-2 text-[#8c6223]"><CircleHelp className="h-5 w-5" /><h2 className="font-bold">عند مواجهة إشكال</h2></div>
          <p className="mt-2 text-sm leading-7 text-[#746445]">افتح «الدعم التقني»، اشرح الخطوة التي سبقت الإشكال، ثم أرفق صورة شاشة خالية من المعلومات الحساسة إن أمكن. توزع التذكرة تلقائياً ويظهر لك تحديثها في مركز الإشعارات.</p>
        </section>
      </section>
    </DashboardLayout>
  );
}
