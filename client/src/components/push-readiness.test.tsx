import { describe, expect, it } from "vitest";
import { pushActivationMessage, pushActivationPlan, pushReadinessMessage, type PushReadinessConfig } from "./PushNotificationPrompt";
import { WEB_PUSH_VAPID_PUBLIC_KEY } from "@shared/push";

const fcmOnly: PushReadinessConfig = { publicKey: "", vapidPublicKey: WEB_PUSH_VAPID_PUBLIC_KEY, vapidKeyConfigured: true, webPushEnabled: false, fcmEnabled: true, serviceAccountConfigured: true };
const webPushOnly: PushReadinessConfig = { publicKey: WEB_PUSH_VAPID_PUBLIC_KEY, vapidPublicKey: WEB_PUSH_VAPID_PUBLIC_KEY, vapidKeyConfigured: true, webPushEnabled: true, fcmEnabled: false, serviceAccountConfigured: false };
const firebaseKey = WEB_PUSH_VAPID_PUBLIC_KEY;

describe("مسار تفعيل الإشعارات اللحظية على الجهاز", () => {
  it("يفضّل Firebase عند جاهزية حساب الخدمة والمفتاح العام وإعداد الواجهة", () => {
    expect(pushActivationPlan({ config: fcmOnly, firebaseReady: true, vapidKey: firebaseKey })).toBe("fcm");
    expect(pushReadinessMessage({ config: fcmOnly, firebaseReady: true, vapidKey: firebaseKey })).toContain("Firebase Cloud Messaging");
  });

  it("يتراجع إلى Web Push الأصلي عند غياب حساب الخدمة مع اكتمال ثلاثية VAPID", () => {
    expect(pushActivationPlan({ config: webPushOnly, firebaseReady: true, vapidKey: firebaseKey })).toBe("web-push");
    expect(pushActivationPlan({ config: fcmOnly, firebaseReady: false, vapidKey: firebaseKey })).toBe("unconfigured");
    expect(pushReadinessMessage({ config: webPushOnly, firebaseReady: true, vapidKey: firebaseKey })).toContain("Web Push الأصلي");
  });

  it("لا يعلن الجاهزية بلا مسار تسليم مكتمل ويشرح ما ينقص بدقة", () => {
    expect(pushActivationPlan({ config: { ...fcmOnly, fcmEnabled: false, serviceAccountConfigured: false }, firebaseReady: true, vapidKey: firebaseKey })).toBe("unconfigured");
    expect(pushReadinessMessage({ config: { ...fcmOnly, fcmEnabled: false, serviceAccountConfigured: false }, firebaseReady: true, vapidKey: firebaseKey })).toContain("FIREBASE_SERVICE_ACCOUNT_JSON");
    expect(pushActivationPlan({ config: { ...webPushOnly, webPushEnabled: false, publicKey: "" }, firebaseReady: true, vapidKey: firebaseKey })).toBe("unconfigured");
    expect(pushReadinessMessage({ config: { ...fcmOnly, vapidKeyConfigured: false }, firebaseReady: true, vapidKey: "" })).toContain("VITE_FIREBASE_VAPID_KEY");
    expect(pushReadinessMessage({ config: { ...fcmOnly, fcmEnabled: false }, firebaseReady: false, vapidKey: firebaseKey })).toContain("VITE_FIREBASE_*");
  });

  it("يرفض المفتاح العام غير الصالح فلا يسجّل جهازاً بلا مسار إرسال فعلي", () => {
    expect(pushActivationPlan({ config: fcmOnly, firebaseReady: true, vapidKey: "مفتاح غير صالح" })).toBe("unconfigured");
    expect(pushActivationPlan({ config: { ...webPushOnly, publicKey: "short" }, firebaseReady: true, vapidKey: firebaseKey })).toBe("unconfigured");
    expect(pushActivationPlan({ config: webPushOnly, firebaseReady: true, vapidKey: "short" })).toBe("web-push");
    expect(pushActivationPlan({ config: null, firebaseReady: true, vapidKey: firebaseKey })).toBe("unconfigured");
  });

  it("يحافظ على رسائل الأخطاء القابلة للتنفيذ", () => {
    expect(pushActivationMessage(null, false)).toContain("HTTPS");
    expect(pushActivationMessage(new DOMException("old", "InvalidStateError"), true)).toContain("اشتراك قديم");
    expect(pushActivationMessage(new DOMException("denied", "NotAllowedError"), true)).toContain("إعدادات الموقع");
  });
});
