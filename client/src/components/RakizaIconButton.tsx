import type { LucideIcon } from "lucide-react";

export type RakizaIconTone = "olive" | "gold" | "alert" | "slate";

const toneGradients: Record<RakizaIconTone, string> = {
  olive: "from-[#2f7653] to-[#1a5c40]",
  gold: "from-[#c9a24a] to-[#98711b]",
  alert: "from-[#c64839] to-[#93271e]",
  slate: "from-[#3a4651] to-[#4e5c69]",
};

/**
 * مكوّن أيقونة موحّد: حجم ثابت، تدرّج لوني لكل قسم، سمك خط ثابت،
 * وتأثيرات hover/active حديثة (تكبير/تصغير + سطوع) مع تعبئة عند التفعيل.
 */
export function RakizaIconButton({
  icon: Icon,
  tone = "olive",
  active = false,
  size = "md",
  variant = "gradient",
  className = "",
}: {
  icon: LucideIcon;
  tone?: RakizaIconTone;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "gradient" | "glass";
  className?: string;
}) {
  const box =
    size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-11 w-11 rounded-2xl" : "h-10 w-10 rounded-xl";
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const surface =
    variant === "glass"
      ? "bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-sm"
      : `bg-gradient-to-br text-white shadow-[0_6px_16px_rgba(20,40,32,0.18)] ${toneGradients[tone]}`;
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center transition-transform duration-200 hover:scale-105 hover:brightness-110 active:scale-95 ${box} ${active ? "ring-2 ring-white/60" : "ring-1 ring-white/20"} ${surface} ${className}`}
    >
      <Icon className={iconSize} strokeWidth={2} fill={active ? "currentColor" : "none"} aria-hidden="true" />
    </span>
  );
}
