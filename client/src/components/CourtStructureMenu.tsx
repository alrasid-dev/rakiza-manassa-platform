import { trpc } from "@/lib/trpc";
import { sortCourtStructureUnits } from "@/lib/appearance";
import { Building2, ChevronDown, Network } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

type UnitRow = { id: number; name: string; code?: string | null; isActive?: boolean };

export default function CourtStructureMenu({ variant = "header" }: { variant?: "header" | "tile" }) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unitsQuery = trpc.court.units.list.useQuery(undefined, { enabled: open || variant === "tile" });
  const units = sortCourtStructureUnits(((unitsQuery.data ?? []) as UnitRow[]).filter(unit => unit.isActive !== false));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerClass = variant === "tile"
    ? "flex w-full flex-col items-center gap-2 rounded-2xl border border-[#c9d8c8] bg-gradient-to-b from-[#e8f4ea] to-[#d5e8d7] px-3 py-4 text-center shadow-[0_8px_18px_rgba(36,95,67,0.12)] transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78a886]"
    : "inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--rakiza-border)] bg-[#eef5ec] px-3 text-xs font-black text-[var(--rakiza-olive-strong)] transition hover:bg-[#dce9da] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#78a886]";

  return (
    <div ref={rootRef} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="هيكلة المحكمة" onClick={() => setOpen(current => !current)} className={triggerClass}>
        {variant === "tile" ? (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--rakiza-olive)] text-white shadow-md"><Network className="h-5 w-5" aria-hidden="true" /></span>
            <span className="text-[11px] font-black text-[var(--rakiza-olive-strong)]">هيكلة المحكمة</span>
          </>
        ) : (
          <>
            <Building2 className="h-4 w-4" aria-hidden="true" />
            هيكلة المحكمة
            <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <div role="menu" className={`absolute z-40 mt-2 max-h-80 w-72 overflow-y-auto rounded-2xl border border-[var(--rakiza-border)] bg-white p-2 shadow-[0_16px_40px_rgba(30,51,42,0.16)] ${variant === "tile" ? "left-1/2 -translate-x-1/2" : "left-0"}`}>
          <p className="px-2 py-1.5 text-[10px] font-bold text-[var(--rakiza-muted)]">أقسام المحكمة (من السجلات فقط)</p>
          {unitsQuery.isLoading ? <p className="px-3 py-4 text-xs text-[var(--rakiza-muted)]">جارٍ التحميل…</p> : units.length ? units.map(unit => (
            <button
              key={unit.id}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); setLocation(`/hierarchy?unitId=${unit.id}`); }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold text-[var(--rakiza-ink)] hover:bg-[#eef5ec]"
            >
              <Network className="h-3.5 w-3.5 shrink-0 text-[var(--rakiza-olive)]" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{unit.name}</span>
            </button>
          )) : <p className="px-3 py-4 text-xs text-[var(--rakiza-muted)]">لا توجد وحدات مسجّلة بعد.</p>}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setLocation("/hierarchy"); }} className="mt-1 flex w-full items-center justify-center rounded-xl border border-[#d5e2d5] bg-[#f4f8f3] px-3 py-2 text-[11px] font-black text-[var(--rakiza-olive)]">فتح الهيكل الكامل</button>
        </div>
      )}
    </div>
  );
}
