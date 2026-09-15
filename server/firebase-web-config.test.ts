import { describe, expect, it } from "vitest";


const __secretReady = Boolean(process.env.VITE_FIREBASE_API_KEY?.trim());

describe("إعداد Firebase Web", () => {
  it.skipIf(!__secretReady)("يقبل مفتاح Firebase Web طلب تحقق غير منشئ للحساب", async () => {
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    expect(apiKey).toBeTruthy();
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey ?? "")}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    });
    const payload = await response.json() as { error?: { message?: string } };
    expect(response.status).toBe(400);
    expect(payload.error?.message).not.toMatch(/API_KEY_INVALID|PROJECT_NOT_FOUND|API_KEY_SERVICE_BLOCKED|CONFIGURATION_NOT_FOUND/i);
  }, 15_000);
});
