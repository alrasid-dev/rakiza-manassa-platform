// عامل خدمة خفيف: لا يخزن بيانات تشغيلية، ويعالج إشعارات Web Push فقط.
// ملاحظة مهمة: التنظيف الصريح لكل الكاش في `activate` يمنع بقاء نسخة HTML/أصول قديمة
// على أجهزة المستخدمين بعد أي نشر جديد (وهو السبب الشائع للشاشة البيضاء).
function scopedAsset(path) {
  try {
    return new URL(String(path).replace(/^\//, ""), self.registration.scope).href;
  } catch {
    return path;
  }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch {
      // لا كاش متاح في هذا المتصفح
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", event => {
  let data = { title: "رَكيزة", body: "لديك تحديث جديد", url: "/", tag: "rakiza-notification", actions: [] };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag,
    dir: "rtl",
    lang: "ar",
    icon: scopedAsset("icons/pwa-192.png"),
    badge: scopedAsset("icons/pwa-192.png"),
    actions: Array.isArray(data.actions) && data.actions.length ? data.actions.slice(0, 2) : [
      { action: "open-tasks", title: "عرض المهام" },
      { action: "open-notifications", title: "مركز التنبيهات" },
    ],
    vibrate: [200, 100, 200],
    requireInteraction: true,
    silent: false,
    data: { url: data.url },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const actionUrl = event.action === "open-tasks" ? "/tasks" : event.action === "open-notifications" ? "/email-settings" : event.notification.data?.url || "/";
  const targetUrl = new URL(actionUrl.replace(/^\//, ""), self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => "focus" in client);
    if (existing) {
      existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
