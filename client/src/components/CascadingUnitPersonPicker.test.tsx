// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    court: {
      units: { list: { useQuery: () => ({ data: [{ id: 1, name: "شؤون الملازمين" }, { id: 60016, name: "شؤون القضاة" }] }) } },
      people: { list: { useQuery: (input?: { unitId?: number }) => ({ data: input?.unitId === 60016 ? [{ id: 41, fullName: "قاضٍ مختبر", personType: "judge", unitId: 60016 }] : input?.unitId ? [{ id: 7, fullName: "موظف مختبر", personType: "administrative", unitId: 1 }] : [] }) } },
    },
  },
}));

import { CascadingUnitPersonPicker } from "./CascadingUnitPersonPicker";

function Harness() {
  const [value, setValue] = useState({ unitId: null as number | null, profileId: null as number | null });
  return <CascadingUnitPersonPicker value={value} onChange={setValue} label="اختيار الموظف" />;
}

afterEach(() => cleanup());

describe("CascadingUnitPersonPicker", () => {
  it("يعطّل قائمة الموظف حتى يُختار قسم ثم يعرض موظفي القسم", () => {
    render(<Harness />);
    const personSelect = screen.getByLabelText("اختر الموظف") as HTMLSelectElement;
    expect(personSelect.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("اختر القسم"), { target: { value: "60016" } });
    expect((screen.getByLabelText("اختر الموظف") as HTMLSelectElement).disabled).toBe(false);
    expect(screen.getByText("قاضٍ مختبر")).toBeTruthy();
  });

  it("يفرّغ الموظف عند تغيير القسم", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("اختر القسم"), { target: { value: "60016" } });
    fireEvent.change(screen.getByLabelText("اختر الموظف"), { target: { value: "41" } });
    fireEvent.change(screen.getByLabelText("اختر القسم"), { target: { value: "1" } });
    expect((screen.getByLabelText("اختر الموظف") as HTMLSelectElement).value).toBe("");
  });
});
