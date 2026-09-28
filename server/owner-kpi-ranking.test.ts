import { describe, expect, it } from "vitest";
import { buildOwnerKpis } from "./platform-completion";

describe("ترتيب الموظفين في مؤشرات المالك", () => {
  const employees = [
    { profileId: 1, fullName: "أ", points: 5, complianceRate: 90 },
    { profileId: 2, fullName: "ب", points: 20, complianceRate: 95 },
    { profileId: 3, fullName: "ج", points: -3, complianceRate: 40 },
    { profileId: 4, fullName: "د", points: 10, complianceRate: 80 },
    { profileId: 5, fullName: "هـ", points: 0, complianceRate: 60 },
    { profileId: 6, fullName: "و", points: 8, complianceRate: 70 },
    { profileId: 7, fullName: "ز", points: -1, complianceRate: 30 },
  ];

  it("يرتب الموظفين تنازلياً حسب النقاط", () => {
    const kpis = buildOwnerKpis({ units: [], pressure: [], accountabilityCount: 0, averageCompletionHours: null, employees });
    expect(kpis.employeeRanking.map((e) => e.points)).toEqual([20, 10, 8, 5, 0, -1, -3]);
    expect(kpis.employeeRanking[0].profileId).toBe(2);
  });

  it("يستخرج أفضل وأسوأ 5 موظفين", () => {
    const kpis = buildOwnerKpis({ units: [], pressure: [], accountabilityCount: 0, averageCompletionHours: null, employees });
    expect(kpis.topPerformers).toHaveLength(5);
    expect(kpis.topPerformers[0].points).toBe(20);
    expect(kpis.lowPerformers).toHaveLength(5);
    expect(kpis.lowPerformers[0].points).toBe(-3);
  });
});
