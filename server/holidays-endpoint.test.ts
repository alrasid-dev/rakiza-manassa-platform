import { describe, expect, it } from "vitest";
import { courtRouter } from "./routers/court";

describe("holidays.today", () => {
  it("يُرجع حالة اليوم (إجازة/رمضان/ساعات عمل) بشكل صحيح", async () => {
    const caller = courtRouter.createCaller({ user: { id: 1, role: "user", email: "employee@court.example", name: "موظف", openId: "employee" } } as never);
    const result = await caller.holidays.today();
    expect(typeof result.isHoliday).toBe("boolean");
    expect(typeof result.isRamadan).toBe("boolean");
    expect(result.workHours).toMatchObject({ start: expect.any(String), end: expect.any(String) });
    expect("holidayName" in result).toBe(true);
    // عند وقوع إجازة يجب أن يظهر اسمها، وعندئذ يكون isHoliday صحيحاً.
    expect(result.isHoliday).toBe(Boolean(result.holidayName));
  });
});
