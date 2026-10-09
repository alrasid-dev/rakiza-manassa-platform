import { trpc } from "@/lib/trpc";
import { getWelcomeItem } from "@/lib/welcome-models";
import { BookOpenText, SunMedium, MoonStar } from "lucide-react";

function firstName(fullName?: string | null): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || "";
}

export default function WelcomeCard({ now }: { now?: Date }) {
  const profile = trpc.court.people.self.useQuery();
  const item = getWelcomeItem(now ?? new Date());
  const name = firstName(profile.data?.fullName);

  if (item.kind === "morning") {
    return (
      <section dir="rtl" className="mt-4 rounded-2xl border border-[#e8e0c8] bg-gradient-to-l from-[#fdfaf0] to-[#f7f2e2] p-5 shadow-[0_10px_30px_rgba(30,51,42,0.04)]">
        <div className="flex items-center gap-2">
          <SunMedium className="h-5 w-5 text-[#b18448]" />
          <p className="text-sm font-bold text-[#6f552c]">{name ? `صباح الخير يا ${name} ☀️` : "صباح الخير ☀️"}</p>
        </div>
        <p dir="rtl" style={{ fontFamily: 'Amiri, "Noto Naskh Arabic", serif' }} className="mt-3 text-center text-2xl leading-loose text-[#355d4b] sm:text-3xl">﴿{item.ayah}﴾</p>
        <p className="mt-2 text-center text-xs font-bold text-[#8a7a55]">[{item.reference}]</p>
        <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-[#a89a7c]"><BookOpenText className="h-3.5 w-3.5" />آية اليوم</div>
      </section>
    );
  }

  return (
    <section dir="rtl" className="mt-4 rounded-2xl border border-[#d8d6ea] bg-gradient-to-l from-[#f6f5fc] to-[#eceaf7] p-5 shadow-[0_10px_30px_rgba(30,51,42,0.04)]">
      <div className="flex items-center gap-2">
        <MoonStar className="h-5 w-5 text-[#6a5aa8]" />
        <p className="text-sm font-bold text-[#4b4370]">{name ? `طاب مساؤك يا ${name} 🌙` : "طاب مساؤك 🌙"}</p>
      </div>
      <p dir="rtl" className="mt-3 text-center text-xl leading-loose text-[#3d3757] sm:text-2xl">«{item.wisdom}»</p>
      <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-[#8a82aa]"><MoonStar className="h-3.5 w-3.5" />حكمة المساء</div>
    </section>
  );
}
