import { trpc } from "@/lib/trpc";
import { getWelcomeItem } from "@/lib/welcome-models";
import { MoonStar, SunMedium } from "lucide-react";

function firstName(fullName?: string | null): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || "";
}

export default function WelcomeCard({ now }: { now?: Date }) {
  const profile = trpc.court.people.self.useQuery();
  const item = getWelcomeItem(now ?? new Date());
  const name = firstName(profile.data?.fullName);

  const isMorning = item.kind === "morning";
  const text = item.kind === "morning" ? item.ayah : item.wisdom;

  return (
    <div className="mt-4 flex flex-col items-start gap-1 py-4">
      <span className="text-xs text-[#8a82aa]">
        {isMorning ? "☀️ صباح الخير" : "🌙 مساء الخير"}{name ? ` يا ${name}` : ""}
      </span>
      <div className="inline-flex items-center gap-2 rounded-2xl bg-[#f5f3fb] px-4 py-2">
        {isMorning ? <SunMedium className="h-5 w-5 shrink-0 text-[#8a82aa]" /> : <MoonStar className="h-5 w-5 shrink-0 text-[#8a82aa]" />}
        <p dir="rtl" style={{ fontFamily: '"Noto Naskh Arabic", serif' }} className="text-lg leading-relaxed text-[#3d3757] sm:text-xl">
          «{text}»
        </p>
      </div>
    </div>
  );
}
