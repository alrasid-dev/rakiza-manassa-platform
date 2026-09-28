import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type SelectedUnitContextValue = {
  selectedUnitId: number | null;
  setSelectedUnitId: (unitId: number | null) => void;
};

const SelectedUnitContext = createContext<SelectedUnitContextValue>({
  selectedUnitId: null,
  setSelectedUnitId: () => undefined,
});

/** يحفظ القسم المختار من الهيدر ليشاركه المالك/القيادة في فلترة المهام والموظفين. */
export function SelectedUnitProvider({ children }: { children: ReactNode }) {
  const [selectedUnitId, setSelectedUnitIdState] = useState<number | null>(null);
  const setSelectedUnitId = useCallback((next: number | null) => setSelectedUnitIdState(next), []);
  const value = useMemo(() => ({ selectedUnitId, setSelectedUnitId }), [selectedUnitId, setSelectedUnitId]);
  return <SelectedUnitContext.Provider value={value}>{children}</SelectedUnitContext.Provider>;
}

export function useSelectedUnit() {
  return useContext(SelectedUnitContext);
}
