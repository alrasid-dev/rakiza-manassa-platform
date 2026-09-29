import { trpc } from "@/lib/trpc";
import React from "react";

export type CascadingUnitPersonValue = { unitId: number | null; profileId: number | null };

type PersonType = "administrative" | "trainee" | "judge";

type Props = {
  value: CascadingUnitPersonValue;
  onChange: (value: CascadingUnitPersonValue) => void;
  /** اختياري: فلترة الموظفين حسب فئاتهم (administrative/trainee/judge). */
  personTypes?: PersonType[];
  label?: string;
  required?: boolean;
};

/**
 * Dropdown متدرج (قسم → موظف): يفرّغ الموظف تلقائياً عند تغيير القسم
 * ويعيد تحميل قائمة موظفي القسم المختار فقط.
 */
export function CascadingUnitPersonPicker({ value, onChange, personTypes, label, required }: Props) {
  const units = trpc.court.units.list.useQuery();
  const people = trpc.court.people.list.useQuery(value.unitId ? { unitId: value.unitId } : undefined, { enabled: Boolean(value.unitId) });
  const candidates = (people.data ?? []).filter(person => !personTypes || personTypes.length === 0 || personTypes.includes(person.personType as PersonType));

  return (
    <div className="space-y-2">
      {label ? <span className="text-xs font-bold text-[#65766d]">{label}</span> : null}
      <select
        aria-label="اختر القسم"
        value={value.unitId ?? ""}
        onChange={event => onChange({ unitId: event.target.value ? Number(event.target.value) : null, profileId: null })}
        className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
        required={required}
      >
        <option value="">اختر القسم</option>
        {(units.data ?? []).map((unit: { id: number; name: string }) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
      </select>
      <select
        aria-label="اختر الموظف"
        value={value.profileId ?? ""}
        onChange={event => onChange({ ...value, profileId: event.target.value ? Number(event.target.value) : null })}
        className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm disabled:opacity-60"
        disabled={!value.unitId}
        required={required}
      >
        <option value="">{value.unitId ? "اختر الموظف" : "اختر القسم أولاً"}</option>
        {candidates.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
      </select>
    </div>
  );
}
