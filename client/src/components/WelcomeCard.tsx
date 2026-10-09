import { trpc } from "@/lib/trpc";
import { getWelcomeItem } from "@/lib/welcome-models";

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
    <section dir="rtl" className="mt-4 rounded-2xl border border-[#d8d6ea] bg-gradient-to-l from-[#f6f5fc] to-[#eceaf7] p-4 shadow-[0_10px_30px_rgba(30,51,42,0.04)] sm:p-6">
      <p className="text-center text-sm font-bold text-[#8a82aa]">
        {isMorning ? "☀️ صباح الخير" : "🌙 مساء الخير"}
        {name ? ` يا ${name}` : ""}
      </p>
      <p dir="rtl" style={{ fontFamily: '"Noto Naskh Arabic", Amiri, serif' }} className="mt-3 text-center text-lg leading-loose text-[#3d3757] sm:text-xl md:text-2xl">
        «{text}»
      </p>
    </section>
  );
}
