import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  listManagerDecisionPatterns: vi.fn(async () => []),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("./assistant-learning-service", () => ({ listManagerDecisionPatterns: mocks.listManagerDecisionPatterns }));

import { predictForManager } from "./assistant-predictions";

describe("تنبؤات مساعد المدير", () => {
  beforeEach(() => {
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ summary: "ملخص", forecasts: [{ label: "التأخير", value: "مرتفع", confidence: 1.7, horizon: "أسبوع", rationale: "بيانات" }], rankedOptions: [{ option: "توزيع", score: 120, rationale: "الأقرب", sources: ["المهام"] }], autoApproval: { eligible: true, reason: "إجراء منخفض المخاطر", actionType: "priority" } }) } }] });
  });

  it("يطبع الثقة والدرجات ضمن الحدود ويمنع الإجراء الحساس", async () => {
    const result = await predictForManager({ assistant: "leadership", taskSnapshot: "ملخص مهام", actionType: "penalty" });
    expect(result.forecasts[0]?.confidence).toBe(1);
    expect(result.rankedOptions[0]?.score).toBe(100);
    expect(result.autoApproval.eligible).toBe(false);
    expect(result.autoApproval.reason).toContain("محظور");
  });

  it("يمرر أنماط المديرين إلى الاستدعاء دون كشفها للموظف", async () => {
    mocks.listManagerDecisionPatterns.mockResolvedValueOnce([{ metadata: '{"assistant":"leadership","decision":"accepted"}' }] as any);
    await predictForManager({ assistant: "leadership", taskSnapshot: "ملخص", actionType: "priority" });
    expect(mocks.listManagerDecisionPatterns).toHaveBeenCalledWith({ assistant: "leadership", limit: 20 });
    expect(mocks.invokeLLM.mock.calls[0]?.[0].response_format.json_schema.strict).toBe(true);
  });
});
