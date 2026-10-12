import { ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

/** زر رجوع موحّد لصفحات مساحة العمل: history.back إن أمكن، وإلا المسار الأب. */
export default function BackButton({ fallback = "/", className = "" }: { fallback?: string; className?: string }) {
  const [location, setLocation] = useLocation();
  if ((location.split("?")[0] || "/") === "/") return null;
  return (
    <button
      type="button"
      aria-label="رجوع"
      title="رجوع"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          window.history.back();
          return;
        }
        setLocation(fallback);
      }}
      className={`inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--rakiza-border)] bg-[#f1f3ed] px-3 text-xs font-black text-[var(--rakiza-olive-strong)] transition hover:bg-[#e0ecdf] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78a886] ${className}`}
    >
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
      رجوع
    </button>
  );
}
