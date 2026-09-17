import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getFirebaseMessaging, firebaseVapidKey, firebaseWebConfigReady } from "@/lib/firebase";
import { isUsableVapidPublicKey } from "@shared/push";
import { getToken, deleteToken } from "firebase/messaging";
import { Button } from "./ui/button";

export function pushActivationMessage(error: unknown, secure: boolean) {
  if (!secure) return "لا يمكن تفعيل التنبيهات من هذا الرابط. افتح نطاق رَكيزة المنشور عبر HTTPS، وليس رابطاً محلياً أو غير آمن.";
  if (error instanceof DOMException && error.name === "InvalidStateError") return "يوجد اشتراك قديم لهذا المتصفح. اضغط «إيقاف» ثم «تفعيل التنبيهات» لتجديده.";
  if (error instanceof DOMException && error.name === "NotAllowedError") return "يرفض المتصفح الإذن حالياً. اسمح بالإشعارات من إعدادات الموقع ثم أعد المحاولة.";
  return "تعذر تفعيل التنبيهات. استخدم نطاق رَكيزة المنشور عبر HTTPS وتحقق من صلاحية الإشعارات في المتصفح.";
}

export type PushReadinessConfig = {
  publicKey?: string | null;
  vapidPublicKey?: string | null;
  vapidKeyConfigured?: boolean;
  webPushEnabled?: boolean;
  fcmEnabled?: boolean;
  serviceAccountConfigured?: boolean;
};

export type PushActivationPlan = "fcm" | "web-push" | "unconfigured";

/**
 * يحدد مسار التفعيل المتاح فعلياً على الجهاز:
 * Firebase أولاً (إرسال عبر حساب الخدمة)، ثم Web Push الأصلي عند اكتمال ثلاثية VAPID على الخادم.
 */
export function pushActivationPlan(input: { config?: PushReadinessConfig | null; firebaseReady: boolean; vapidKey?: string | null }): PushActivationPlan {
  const config = input.config ?? {};
  const firebaseKeyReady = Boolean(input.vapidKey) && isUsableVapidPublicKey(input.vapidKey);
  if (config.fcmEnabled && input.firebaseReady && firebaseKeyReady) return "fcm";
  if (config.webPushEnabled && isUsableVapidPublicKey(config.publicKey)) return "web-push";
  return "unconfigured";
}

/** صياغة عربية دقيقة لحالة الجاهزية بدل رسالة فشل عامة. */
export function pushReadinessMessage(input: { config?: PushReadinessConfig | null; firebaseReady: boolean; vapidKey?: string | null }) {
  const plan = pushActivationPlan(input);
  if (plan === "fcm") return "الإشعارات جاهزة للتفعيل على هذا الجهاز عبر Firebase Cloud Messaging.";
  if (plan === "web-push") return "الإشعارات جاهزة للتفعيل على هذا الجهاز عبر Web Push الأصلي.";
  const config = input.config ?? {};
  if (!config.vapidKeyConfigured) return "لا يوجد مفتاح VAPID عام صالح للإشعارات. أضف VITE_FIREBASE_VAPID_KEY في بيئة التشغيل ثم أعد النشر.";
  if (!input.firebaseReady && !config.webPushEnabled) return "إعداد Firebase Web ناقص في الواجهة. أضف VITE_FIREBASE_* ثم أعد النشر.";
  return "يلزم استكمال إعداد الخادم: أضف حساب خدمة Firebase (FIREBASE_SERVICE_ACCOUNT_JSON) أو ثلاثية VAPID (VAPID_PUBLIC_KEY وVAPID_PRIVATE_KEY) في بيئة التشغيل.";
}


function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(Array.from(raw).map(char => char.charCodeAt(0)));
}

export function PushNotificationPrompt() {
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const pushRouter = trpc.court.notifications as any;
  if (!supported || !pushRouter.pushConfig || !pushRouter.subscribe || !pushRouter.unsubscribe) return null;
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(Notification.permission);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const config = pushRouter.pushConfig.useQuery(undefined, { enabled: supported });
  const subscribe = pushRouter.subscribe.useMutation();
  const unsubscribe = pushRouter.unsubscribe.useMutation();
  const fcmSubscribe = pushRouter.fcmSubscribe?.useMutation();
  const fcmUnsubscribe = pushRouter.fcmUnsubscribe?.useMutation();
  const testPush = pushRouter.test?.useMutation({ onSuccess: () => setMessage("أُرسل اختبار Web Push. أغلق التطبيق وانتظر إشعار النظام."), onError: (error: Error) => setMessage(error.message) });
  const fcmTest = pushRouter.fcmTest?.useMutation({ onSuccess: () => setMessage("أُرسل اختبار Firebase. أغلق التطبيق وانتظر إشعار النظام."), onError: (error: Error) => setMessage(error.message) });
  const activationPlan = pushActivationPlan({ config: config.data, firebaseReady: firebaseWebConfigReady, vapidKey: firebaseVapidKey });
  const activationHint = pushReadinessMessage({ config: config.data, firebaseReady: firebaseWebConfigReady, vapidKey: firebaseVapidKey });

  useEffect(() => {
    if (!supported || permission !== "granted" || activationPlan !== "fcm" || !fcmSubscribe) return;
    void navigator.serviceWorker.ready.then(async registration => {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return;
      const token = await getToken(messaging, { vapidKey: firebaseVapidKey, serviceWorkerRegistration: registration });
      if (!token) return;
      await fcmSubscribe.mutateAsync({ token, platform: "web-pwa", userAgent: navigator.userAgent });
      setFcmToken(token);
    }).catch(error => {
      console.warn("[FCM] تعذر تسجيل الرمز", error);
      setMessage("تعذر تسجيل إشعارات Firebase لهذا التطبيق. أعد المحاولة بعد تحديث التطبيق.");
    });
  }, [activationPlan, fcmSubscribe, permission, supported]);

  useEffect(() => {
    if (!supported || permission !== "granted") return;
    void navigator.serviceWorker.ready.then(async registration => {
      const existing = await registration.pushManager.getSubscription();
      if (!existing || activationPlan !== "web-push") { setHasSubscription(false); return; }
      const json = existing.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
      await subscribe.mutateAsync({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, userAgent: navigator.userAgent });
      setHasSubscription(true);
    }).catch((error) => {
      console.warn("[Push] تعذر تسجيل الاشتراك الحالي", error);
      setHasSubscription(false);
      setMessage(pushActivationMessage(error, true));
    });
  }, [activationPlan, permission, supported]);

  if (permission === "denied") return null;
  if (permission === "granted" && (hasSubscription || fcmToken)) {
    return <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c7ddca] bg-[#e7f1e6] px-4 py-3 text-xs font-semibold text-[#2d684a]"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> إشعارات رَكيزة مفعلة على هذا الجهاز</span><div className="flex gap-2">{testPush && <Button type="button" size="sm" variant="outline" disabled={testPush.isPending} onClick={() => testPush.mutate()}>اختبار Web Push</Button>}{fcmTest && fcmToken && <Button type="button" size="sm" variant="outline" disabled={fcmTest.isPending} onClick={() => fcmTest.mutate()}>اختبار Firebase</Button>}</div></div>;
  }

  const enable = async () => {
    if (!window.isSecureContext) {
      setMessage(pushActivationMessage(null, false));
      return;
    }
    const plan = activationPlan;
    if (plan === "unconfigured") {
      setMessage(activationHint);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setMessage("لم يتم تفعيل الإشعارات. يمكنك السماح بها من إعدادات المتصفح لاحقاً.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      if (plan === "fcm") {
        const messaging = await getFirebaseMessaging();
        if (!messaging || !fcmSubscribe) throw new Error("FCM messaging unavailable");
        const token = await getToken(messaging, { vapidKey: firebaseVapidKey, serviceWorkerRegistration: registration });
        if (!token) throw new Error("FCM token unavailable");
        await fcmSubscribe.mutateAsync({ token, platform: "web-pwa", userAgent: navigator.userAgent });
        setFcmToken(token);
        setHasSubscription(true);
        setMessage("تم تفعيل إشعارات Firebase على هذا الجهاز.");
        return;
      }
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !hasSubscription) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(config.data!.publicKey!) });
      }
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("بيانات الاشتراك غير مكتملة");
      await subscribe.mutateAsync({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, userAgent: navigator.userAgent });
      setHasSubscription(true);
      setMessage("تم تفعيل التنبيهات على هذا الجهاز.");
    } catch (error) {
      setMessage(pushActivationMessage(error, true));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await unsubscribe.mutateAsync({ endpoint: current.endpoint });
        await current.unsubscribe();
      }
      if (fcmToken && fcmUnsubscribe) {
        const messaging = await getFirebaseMessaging();
        if (messaging) await deleteToken(messaging);
        await fcmUnsubscribe.mutateAsync({ token: fcmToken });
      }
      setFcmToken(null);
      setHasSubscription(false);
      setPermission(Notification.permission);
      setMessage("تم إيقاف تنبيهات هذا الجهاز.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#d5dacd] bg-[#eeefe7] px-4 py-3 text-sm text-[#4d5547] sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-start gap-3"><Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#4a785a]" /><div><p className="font-bold">فعّل تنبيهات المهام على هذا الجهاز</p><p className="mt-1 text-xs leading-6">ستظهر رسالة النظام حتى عند إغلاق التطبيق، وفق إعدادات الصوت في جهازك. إذا كان الإذن مسموحاً لكن التسجيل غير مكتمل، سيُجدّد التطبيق اشتراك هذا الجهاز تلقائياً.</p>{activationPlan === "unconfigured" && !message && <p className="mt-1 text-xs font-semibold text-[#8a5a1a]">{activationHint}</p>}{message && <p className={`mt-1 text-xs font-semibold ${message.includes("تم ") ? "text-[#2d684a]" : "text-[#9b2c2c]"}`}>{message}</p>}</div></div>
    <div className="flex shrink-0 gap-2"><Button type="button" disabled={busy} onClick={enable} className="bg-[#2d6b4f] text-white hover:bg-[#245f43]"><BellRing className="ml-2 h-4 w-4" />{busy ? "جارٍ التفعيل…" : "تفعيل التنبيهات"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void disable()} className="border-[#c7d1c5]">إيقاف</Button></div>
  </div>;
}
