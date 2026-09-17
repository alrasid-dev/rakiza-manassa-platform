/**
 * حارس إقلاع رَكيزة: يمنع «الشاشة البيضاء» الصامتة.
 *
 * المشكلة التي يعالجها: إذا استلم المتصفح HTML مكان ملف JavaScript (نشر جديد/كاش قديم/
 * عامل خدمة عالق)، فإن الحزمة لا تُنفَّذ ولا يظهر أي خطأ للمستخدم — تبقى الصفحة بيضاء.
 *
 * هذا الملف خارجي (لا سكربت مضمّن) ليعمل تحت سياسة أمان المحتوى، ويقوم بثلاثة أمور:
 * 1) يراقب `error` و`unhandledrejection` ويلتقط أخطاء تحميل الوحدات.
 * 2) إن لم تُرسم الواجهة خلال مهلة محددة، يعرض بطاقة واضحة بالعربية بدل الصفحة البيضاء.
 * 3) يوفّر إصلاحاً ذاتياً: يلغي تسجيل عامل الخدمة، يمسح كل الكاش، ثم يعيد التحميل.
 */
(function () {
  if (typeof window === "undefined") return;
  if (window.__RAKIZA_BOOT_GUARD__) return;
  window.__RAKIZA_BOOT_GUARD__ = { installedAt: Date.now() };

  var TIMEOUT_MS = Number(window.RAKIZA_BOOT_TIMEOUT_MS || 10000);
  var RELOAD_FLAG = "rakiza-boot-guard-reload";
  var shown = false;

  function rootHasContent() {
    var root = document.getElementById("root");
    return Boolean(root && String(root.innerHTML || "").trim().length > 0);
  }

  /** إشارة إقلاع موثوقة: تُضبط من main.tsx بعد نجاح الرسم، وتُستخدم مع فحص محتوى الجذر. */
  function appMounted() {
    return Boolean(window.__RAKIZA_APP_MOUNTED__) || rootHasContent();
  }

  function buildOverlay() {
    var existing = document.querySelector("[data-rakiza-boot-guard]");
    if (existing) return existing;
    var box = document.createElement("div");
    box.setAttribute("data-rakiza-boot-guard", "true");
    box.dir = "rtl";
    box.setAttribute("role", "alert");
    box.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483647", "display:flex", "align-items:center",
      "justify-content:center", "background:#f7f6ef", "padding:24px", "font-family:Tajawal,Cairo,system-ui,sans-serif",
    ].join(";");
    box.innerHTML = [
      '<div style="max-width:560px;width:100%;background:#ffffff;border:1px solid #d5ddd2;border-radius:20px;padding:26px;box-shadow:0 18px 40px rgba(18,53,47,0.12);color:#243a32">',
      '<p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.14em;color:#b18448">رَكيزة · تنبيه تشغيلي</p>',
      '<h1 style="margin:10px 0 0;font-size:22px;font-weight:900;color:#12352f">تعذّر تحميل المنصة على هذا الجهاز</h1>',
      '<p style="margin:10px 0 0;font-size:14px;line-height:1.9;color:#5c6c64">غالباً السبب نسخة قديمة محفوظة في المتصفح أو ملفات ناقصة من نشر سابق. اضغط «إصلاح تلقائي» وسيتم تنظيف الكاش وإعادة التحميل تلقائياً.</p>',
      '<p data-rakiza-boot-reason style="margin:12px 0 0;font-size:12px;line-height:1.8;color:#8a5a2b;background:#fdf6e8;border-radius:10px;padding:10px 12px"></p>',
      '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">',
      '<button type="button" data-rakiza-heal style="flex:1 1 200px;cursor:pointer;border:0;border-radius:12px;padding:12px 16px;font-size:14px;font-weight:800;color:#ffffff;background:#12352f">إصلاح تلقائي وإعادة التحميل</button>',
      '<button type="button" data-rakiza-reload style="flex:1 1 140px;cursor:pointer;border-radius:12px;padding:12px 16px;font-size:14px;font-weight:800;color:#12352f;background:#ffffff;border:1px solid #cdd8cb">إعادة المحاولة</button>',
      "</div></div>",
    ].join("");
    box.querySelector("[data-rakiza-heal]").addEventListener("click", function () { heal(); });
    box.querySelector("[data-rakiza-reload]").addEventListener("click", function () { reloadNow(); });
    (document.body || document.documentElement).appendChild(box);
    return box;
  }

  function show(reason) {
    if (shown) return;
    shown = true;
    try {
      var box = buildOverlay();
      var slot = box.querySelector("[data-rakiza-boot-reason]");
      if (slot && reason) slot.textContent = reason;
      window.__RAKIZA_BOOT_GUARD__.failed = true;
      window.__RAKIZA_BOOT_GUARD__.reason = reason || "";
    } catch (error) {
      console.error("[rakiza] boot guard overlay failed", error);
    }
  }

  function reloadNow() {
    try { window.location.reload(); } catch (error) { console.error("[rakiza] reload failed", error); }
  }


  /** إصلاح ذاتي: إلغاء عامل الخدمة + مسح كل الكاش + إعادة تحميل بمعامل كسر الكاش. */
  function heal() {
    var jobs = [];
    try {
      if (window.navigator && window.navigator.serviceWorker && window.navigator.serviceWorker.getRegistrations) {
        jobs.push(window.navigator.serviceWorker.getRegistrations().then(function (registrations) {
          return Promise.all(registrations.map(function (registration) { return registration.unregister(); }));
        }).catch(function () { return null; }));
      }
    } catch (error) { /* تجاهل */ }
    try {
      if (window.caches && window.caches.keys) {
        jobs.push(window.caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return window.caches.delete(key); }));
        }).catch(function () { return null; }));
      }
    } catch (error) { /* تجاهل */ }
    return Promise.all(jobs).catch(function () { return null; }).then(function () {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set("rakiza_refresh", String(Date.now()));
        window.location.replace(url.toString());
      } catch (error) {
        reloadNow();
      }
    });
  }
  window.rakizaSelfHeal = heal;

  function messageOf(reason) {
    if (!reason) return "";
    if (typeof reason === "string") return reason;
    return String(reason.message || (reason.reason && reason.reason.message) || "");
  }

  function describeError(reason) {
    var text = messageOf(reason);
    if (/MIME type|not a valid JavaScript|Failed to fetch dynamically imported module|Importing a module script failed|Unexpected token '<'/i.test(text)) {
      return "استلم المتصفح صفحة HTML بدل ملفات البرنامج (نسخة قديمة محفوظة بعد نشر جديد)، ويمكن إصلاحه فوراً.";
    }
    if (/ChunkLoadError|Loading chunk|Importing a module/i.test(text)) {
      return "فشل تحميل أحد ملفات الواجهة، ويغلب أن يزول بإعادة تحميل نظيفة.";
    }
    return text ? "تفصيل تقني: " + text.slice(0, 220) : "";
  }

  function isModuleLoadFailure(reason) {
    return /MIME type|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(messageOf(reason));
  }

  function shouldAutoHeal(reason) {
    if (!isModuleLoadFailure(reason)) return false;
    try {
      if (window.sessionStorage.getItem(RELOAD_FLAG) === "1") return false;
      window.sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch (error) {
      return false;
    }
    return true;
  }

  window.addEventListener("error", function (event) {
    var reason = (event && event.error) || (event && event.message ? { message: event.message } : null);
    if (!reason) return;
    if (isModuleLoadFailure(reason)) {
      show(describeError(reason));
      if (shouldAutoHeal(reason)) heal();
      return;
    }
    // خطأ عادي داخل التطبيق: لا نحجب الواجهة عنه، ولا نعرض البطاقة إلا إذا كانت الواجهة فارغة فعلاً.
    if (!rootHasContent()) show(describeError(reason));
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    if (!reason) return;
    if (isModuleLoadFailure(reason)) {
      show(describeError(reason));
      if (shouldAutoHeal(reason)) heal();
      return;
    }
    if (!rootHasContent()) show(describeError(reason));
  });

  function startWatch() {
    function evaluate() {
      if (appMounted()) return;
      // ما زالت الصفحة تُحمَّل (شبكة بطيئة)؟ نمنحها مهلة إضافية بعد حدث load قبل إظهار أي بطاقة.
      if (document.readyState !== "complete") {
        window.addEventListener("load", function () { window.setTimeout(evaluate, 1500); }, { once: true });
        return;
      }
      try { window.sessionStorage.removeItem(RELOAD_FLAG); } catch (error) { /* تجاهل */ }
      show("لم تُرسم واجهة المنصة خلال " + Math.round(TIMEOUT_MS / 1000) + " ثانية على هذا الجهاز.");
    }
    window.setTimeout(evaluate, TIMEOUT_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startWatch);
  else startWatch();

  window.__RAKIZA_BOOT_GUARD__.show = show;
  window.__RAKIZA_BOOT_GUARD__.heal = heal;
})();
