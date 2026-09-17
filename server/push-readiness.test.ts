import { afterEach, describe, expect, it } from "vitest";
import webpush from "web-push";
import { WEB_PUSH_VAPID_PUBLIC_KEY, isUsableVapidPublicKey, resolveVapidPublicKey } from "../shared/push";
import { isFcmConfigured, isWebPushConfigured, pushReadiness } from "./push-service";
import { courtRouter } from "./routers/court";

const caller = () => courtRouter.createCaller({
  user: { id: 9, role: "user", email: "employee@moj.gov.sa", name: "موظف اختبار", openId: "employee" },
} as never);

const ENV_KEYS = ["FIREBASE_SERVICE_ACCOUNT_JSON", "VITE_FIREBASE_VAPID_KEY"] as const;
const snapshot = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
});

describe("مفتاح VAPID العام المعتمد للإشعارات اللحظية", () => {
  it("مفتاح صالح فعلياً: 65 بايت بترميز base64url ويقبله web-push", () => {
    expect(isUsableVapidPublicKey(WEB_PUSH_VAPID_PUBLIC_KEY)).toBe(true);
    const raw = Buffer.from(WEB_PUSH_VAPID_PUBLIC_KEY, "base64url");
    expect(raw.byteLength).toBe(65);
    expect(raw[0]).toBe(4);
    const { privateKey } = webpush.generateVAPIDKeys();
    expect(() => webpush.setVapidDetails("mailto:rakizaplatform@gmail.com", WEB_PUSH_VAPID_PUBLIC_KEY, privateKey)).not.toThrow();
  });

  it("يرفض المفاتيح غير الصالحة ويتجاهل القيم الفارغة", () => {
    expect(isUsableVapidPublicKey("")).toBe(false);
    expect(isUsableVapidPublicKey("short-key")).toBe(false);
    expect(isUsableVapidPublicKey("B".repeat(86))).toBe(false);
    expect(isUsableVapidPublicKey("مفتاح غير صالح")).toBe(false);
    expect(isUsableVapidPublicKey(null)).toBe(false);
    expect(resolveVapidPublicKey("", undefined, "not-a-key", WEB_PUSH_VAPID_PUBLIC_KEY)).toBe(WEB_PUSH_VAPID_PUBLIC_KEY);
    expect(resolveVapidPublicKey("", null)).toBe("");
  });
});

describe("جاهزية الإشعارات كما تعرضها الواجهة", () => {
  it("تُعلن مسار Firebase جاهزاً عند وجود حساب الخدمة مع المفتاح العام المعتمد", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "rakiza", client_email: "svc@rakiza.invalid", private_key: "-----BEGIN PRIVATE KEY-----" });
    delete process.env.VITE_FIREBASE_VAPID_KEY;
    const config = await caller().notifications.pushConfig();
    expect(config.vapidPublicKey).toBe(WEB_PUSH_VAPID_PUBLIC_KEY);
    expect(config.vapidKeyConfigured).toBe(true);
    expect(config.serviceAccountConfigured).toBe(true);
    expect(config.fcmEnabled).toBe(true);
    expect(isFcmConfigured()).toBe(true);
  });

  it("تفصل غياب حساب الخدمة عن غياب مفاتيح Web Push الأصلي", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const config = await caller().notifications.pushConfig();
    expect(config.serviceAccountConfigured).toBe(false);
    expect(config.fcmEnabled).toBe(false);
    expect(isFcmConfigured()).toBe(false);
    expect(config.webPushEnabled).toBe(isWebPushConfigured());
    expect(config.publicKey).toBe(process.env.VAPID_PUBLIC_KEY?.trim() ?? "");
  });

  it("تعطي الأولوية لمفتاح البيئة ولا تكشف أي سر في الاستجابة", async () => {
    process.env.VITE_FIREBASE_VAPID_KEY = webpush.generateVAPIDKeys().publicKey;
    const config = await caller().notifications.pushConfig();
    expect(config.vapidPublicKey).toBe(process.env.VITE_FIREBASE_VAPID_KEY);
    expect(pushReadiness().vapidPublicKey).toBe(process.env.VITE_FIREBASE_VAPID_KEY);
    expect(Object.keys(config)).not.toContain("privateKey");
    expect(Object.keys(config)).not.toContain("serviceAccountJson");
    expect(JSON.stringify(config)).not.toMatch(/private_key|privateKey|BEGIN PRIVATE/);
  });
});
