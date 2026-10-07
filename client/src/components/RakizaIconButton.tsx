import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  gradient?: string; // مثال: "from-emerald-500 to-emerald-600"
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
};

/** أيقونة موحّدة: حاوية 40px + أيقونة 20px (نسبة ملء 50%) + تدرّج لوني + تأثيرات hover/active. */
export function RakizaIconButton({
  icon: Icon,
  gradient = "from-emerald-500 to-emerald-600",
  className,
  onClick,
  ariaLabel,
}: Props) {
  return (
    <span
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
        "bg-gradient-to-br ring-1 ring-black/5 shadow-sm",
        "transition-all duration-200",
        "hover:scale-105 hover:brightness-110",
        "active:scale-95",
        gradient,
        className,
      )}
    >
      <Icon className="h-5 w-5 text-white" strokeWidth={2} />
    </span>
  );
}
