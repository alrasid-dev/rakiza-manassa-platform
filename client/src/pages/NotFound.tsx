import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div dir="rtl" className="flex min-h-screen w-screen items-center justify-center overflow-x-hidden bg-[#f7f5ef] p-5" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <Card className="w-full max-w-md border-[#e8e1d4] bg-white/90 shadow-[0_24px_65px_rgba(31,53,44,0.12)] backdrop-blur-sm">
        <CardContent className="p-8 text-center sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#f9e8e3] text-[#b5543b]">
            <AlertCircle className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="mt-7 text-5xl font-bold tracking-tight text-[var(--rakiza-ink)]">404</p>
          <h1 className="mt-3 text-2xl font-bold text-[var(--rakiza-ink)]">الصفحة غير متاحة</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--rakiza-muted)]">لم نتمكن من العثور على الصفحة المطلوبة. قد يكون الرابط غير صحيح أو تم نقل الصفحة.</p>
          <Button onClick={() => setLocation("/")} className="mt-7 bg-[var(--rakiza-olive-strong)] px-6 py-5 text-sm font-bold hover:bg-[#1e5045]">
            <Home className="ml-2 h-4 w-4" /> العودة إلى لوحة القيادة <ArrowLeft className="mr-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
