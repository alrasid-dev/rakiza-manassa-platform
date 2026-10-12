import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";

export default function ExportKpiPage() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/export/kpi", { method: "GET", credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 401) throw new Error("يجب تسجيل الدخول أولاً.");
        if (res.status === 403) throw new Error("هذه الصفحة متاحة للمالك ورئيس المحكمة فقط.");
        throw new Error(body?.error ?? "فشل توليد التقرير.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? "rakiza_kpi.xlsx";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <DashboardLayout>
      <section dir="rtl" className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-xs font-black tracking-[0.14em] text-[var(--rakiza-gold)]">المالك ورئيس المحكمة فقط</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--rakiza-ink)]">تصدير تقرير KPI</h1>
          <p className="mt-2 text-sm leading-7 text-[var(--rakiza-muted)]">
            ملف Excel بورقة واحدة يجمع الأرقام والتحليلات والتوقعات الذكية للفترة الحالية، بهوية المنصة.
          </p>
        </header>

        <article className="rounded-[1.5rem] border bg-white p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--rakiza-olive-soft)] text-[var(--rakiza-olive-strong)]">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-black text-[var(--rakiza-ink)]">تقرير Excel موحّد</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--rakiza-muted)]">
                يتضمن: مؤشرات الأداء، متوسطات الأداء، نسبة الأتمتة، التوقعات، وتدفق العمليات اليومي.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--rakiza-olive-strong)] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "جارٍ توليد الملف…" : "تنزيل تقرير KPI"}
          </button>

          {error ? <p className="mt-3 text-sm font-bold text-[var(--rakiza-danger)]">{error}</p> : null}
        </article>
      </section>
    </DashboardLayout>
  );
}
